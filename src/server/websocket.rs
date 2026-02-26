use crate::events::EventSubscriber;
use axum::extract::ws::{Message, WebSocket};
use futures::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tokio::sync::mpsc;
use tracing::{debug, error, info, warn};
use uuid::Uuid;

/// Maximum number of channels a single connection can subscribe to
const MAX_SUBSCRIPTIONS: usize = 50;

/// Client-to-server WebSocket messages
#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ClientMessage {
    /// Subscribe to channels
    Subscribe { channels: Vec<String> },
    /// Unsubscribe from channels
    Unsubscribe { channels: Vec<String> },
    /// Ping to keep connection alive
    Ping,
}

/// Server-to-client WebSocket messages
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ServerMessage {
    /// Subscription confirmed
    Subscribed { channels: Vec<String> },
    /// Unsubscription confirmed
    Unsubscribed { channels: Vec<String> },
    /// Event notification
    Event {
        channel: String,
        event: String,
        data: serde_json::Value,
        timestamp: String,
    },
    /// Error message
    Error { message: String },
    /// Pong response
    Pong,
}

impl ServerMessage {
    fn to_json(&self) -> String {
        serde_json::to_string(self)
            .unwrap_or_else(|_| r#"{"type":"error","message":"serialization failed"}"#.to_string())
    }
}

/// Commands sent from the WebSocket receiver to the event handler
#[derive(Debug)]
enum SubscriptionCommand {
    Subscribe(Vec<String>),
    Unsubscribe(Vec<String>),
}

/// Handle a WebSocket connection
pub async fn handle_websocket(
    socket: WebSocket,
    mut subscriber: EventSubscriber,
    project_id: Uuid,
    user_id: Uuid,
) {
    let connection_id = Uuid::new_v4();
    info!(
        connection_id = %connection_id,
        project_id = %project_id,
        user_id = %user_id,
        "WebSocket connection established"
    );

    let (mut ws_sender, mut ws_receiver) = socket.split();

    // Channel for subscription commands
    let (cmd_tx, mut cmd_rx) = mpsc::channel::<SubscriptionCommand>(16);
    // Channel for outgoing messages
    let (msg_tx, mut msg_rx) = mpsc::channel::<ServerMessage>(100);

    // Clone msg_tx for the receiver task
    let msg_tx_recv = msg_tx.clone();

    // Task 1: Handle incoming WebSocket messages
    let recv_task = tokio::spawn(async move {
        while let Some(result) = ws_receiver.next().await {
            match result {
                Ok(Message::Text(text)) => {
                    match serde_json::from_str::<ClientMessage>(&text) {
                        Ok(ClientMessage::Subscribe { channels }) => {
                            // Validate
                            if channels.len() > MAX_SUBSCRIPTIONS {
                                let _ = msg_tx_recv
                                    .send(ServerMessage::Error {
                                        message: format!(
                                            "Too many channels. Max {} allowed",
                                            MAX_SUBSCRIPTIONS
                                        ),
                                    })
                                    .await;
                                continue;
                            }

                            let mut valid_channels = Vec::new();
                            let mut invalid = false;
                            for ch in &channels {
                                if !is_valid_channel(ch) {
                                    let _ = msg_tx_recv
                                        .send(ServerMessage::Error {
                                            message: format!("Invalid channel: {}", ch),
                                        })
                                        .await;
                                    invalid = true;
                                    break;
                                }
                                valid_channels.push(ch.clone());
                            }

                            if !invalid && !valid_channels.is_empty() {
                                let _ = cmd_tx
                                    .send(SubscriptionCommand::Subscribe(valid_channels.clone()))
                                    .await;
                                let _ = msg_tx_recv
                                    .send(ServerMessage::Subscribed {
                                        channels: valid_channels,
                                    })
                                    .await;
                            }
                        }
                        Ok(ClientMessage::Unsubscribe { channels }) => {
                            let _ = cmd_tx
                                .send(SubscriptionCommand::Unsubscribe(channels.clone()))
                                .await;
                            let _ = msg_tx_recv
                                .send(ServerMessage::Unsubscribed { channels })
                                .await;
                        }
                        Ok(ClientMessage::Ping) => {
                            let _ = msg_tx_recv.send(ServerMessage::Pong).await;
                        }
                        Err(e) => {
                            warn!("Invalid WebSocket message: {}", e);
                            let _ = msg_tx_recv
                                .send(ServerMessage::Error {
                                    message: format!("Invalid message: {}", e),
                                })
                                .await;
                        }
                    }
                }
                Ok(Message::Ping(_)) | Ok(Message::Pong(_)) => {
                    // Handled by axum
                }
                Ok(Message::Close(_)) => {
                    info!(connection_id = %connection_id, "Client closed connection");
                    break;
                }
                Ok(Message::Binary(_)) => {
                    warn!("Received binary message, ignoring");
                }
                Err(e) => {
                    error!("WebSocket receive error: {}", e);
                    break;
                }
            }
        }
    });

    // Task 2: Handle events from subscriber and forward to WebSocket
    let msg_tx_events = msg_tx.clone();
    let event_task = tokio::spawn(async move {
        loop {
            tokio::select! {
                // Check for subscription commands
                Some(cmd) = cmd_rx.recv() => {
                    match cmd {
                        SubscriptionCommand::Subscribe(channels) => {
                            for ch in channels {
                                subscriber.subscribe_channel(ch);
                            }
                        }
                        SubscriptionCommand::Unsubscribe(channels) => {
                            for ch in &channels {
                                subscriber.unsubscribe_channel(ch);
                            }
                        }
                    }
                }
                // Check for events (with timeout to allow checking commands)
                event = async {
                    // Use a short timeout so we can process commands
                    tokio::time::timeout(
                        Duration::from_millis(100),
                        subscriber.recv()
                    ).await
                } => {
                    if let Ok(Some(event)) = event {
                        let msg = ServerMessage::Event {
                            channel: event.channel(),
                            event: event.event_type.to_string(),
                            data: event.data,
                            timestamp: event.timestamp.to_rfc3339(),
                        };
                        if msg_tx_events.send(msg).await.is_err() {
                            // Channel closed, exit
                            break;
                        }
                    }
                }
            }
        }
    });

    // Task 3: Send messages to WebSocket
    let send_task = tokio::spawn(async move {
        while let Some(msg) = msg_rx.recv().await {
            let text = msg.to_json();
            if ws_sender.send(Message::Text(text.into())).await.is_err() {
                break;
            }
        }
    });

    // Wait for tasks to complete
    tokio::select! {
        _ = recv_task => {
            debug!("Receive task ended");
        }
        _ = event_task => {
            debug!("Event task ended");
        }
        _ = send_task => {
            debug!("Send task ended");
        }
    }

    info!(connection_id = %connection_id, "WebSocket connection closed");
}

/// Validate channel name format
fn is_valid_channel(channel: &str) -> bool {
    if channel.is_empty() || channel.len() > 200 {
        return false;
    }

    let parts: Vec<&str> = channel.split(':').collect();
    if parts.len() != 2 {
        return false;
    }

    let resource_type = parts[0];
    let resource_id = parts[1];

    let valid_types = ["document", "collection", "vector", "table", "project"];
    if !valid_types.contains(&resource_type) {
        return false;
    }

    if resource_id.is_empty() {
        return false;
    }

    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_channels() {
        assert!(is_valid_channel("document:*"));
        assert!(is_valid_channel("document:abc123"));
        assert!(is_valid_channel("collection:my_collection"));
        assert!(is_valid_channel("project:550e8400-e29b-41d4-a716-446655440000"));

        assert!(!is_valid_channel(""));
        assert!(!is_valid_channel("invalid"));
        assert!(!is_valid_channel("unknown:resource"));
        assert!(!is_valid_channel("document:"));
    }

    #[test]
    fn test_client_message_parsing() {
        let json = r#"{"type":"subscribe","channels":["document:*"]}"#;
        let msg: ClientMessage = serde_json::from_str(json).unwrap();
        matches!(msg, ClientMessage::Subscribe { channels } if channels == vec!["document:*"]);

        let json = r#"{"type":"ping"}"#;
        let msg: ClientMessage = serde_json::from_str(json).unwrap();
        matches!(msg, ClientMessage::Ping);
    }

    #[test]
    fn test_server_message_serialization() {
        let msg = ServerMessage::Event {
            channel: "document:abc".to_string(),
            event: "document.processed".to_string(),
            data: serde_json::json!({"status": "ok"}),
            timestamp: "2024-01-15T10:30:00Z".to_string(),
        };

        let json = msg.to_json();
        assert!(json.contains("\"type\":\"event\""));
        assert!(json.contains("\"channel\":\"document:abc\""));
    }
}
