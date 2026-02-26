mod types;
pub mod webhook_dispatcher;

pub use types::{Event, EventType};
pub use webhook_dispatcher::WebhookDispatcher;

use std::sync::Arc;
use tokio::sync::broadcast;
use tracing::{debug, warn};
use uuid::Uuid;

/// Default channel capacity for event broadcasting
const DEFAULT_CHANNEL_CAPACITY: usize = 1024;

/// Event publisher that broadcasts events to all subscribers
#[derive(Clone)]
pub struct EventPublisher {
    sender: broadcast::Sender<Event>,
}

impl EventPublisher {
    /// Create a new event publisher
    pub fn new() -> Self {
        let (sender, _) = broadcast::channel(DEFAULT_CHANNEL_CAPACITY);
        Self { sender }
    }

    /// Create with custom capacity
    pub fn with_capacity(capacity: usize) -> Self {
        let (sender, _) = broadcast::channel(capacity);
        Self { sender }
    }

    /// Publish an event to all subscribers
    pub fn publish(&self, event: Event) {
        // Log the event
        debug!(
            event_type = %event.event_type,
            project_id = %event.project_id,
            resource_id = %event.resource_id,
            "Publishing event"
        );

        // Send to all subscribers (ignore if no subscribers)
        if let Err(e) = self.sender.send(event) {
            // This only happens if there are no active receivers, which is fine
            debug!("No active event subscribers: {}", e);
        }
    }

    /// Publish a new event with the given parameters
    pub fn emit(
        &self,
        event_type: EventType,
        project_id: Uuid,
        resource_id: impl Into<String>,
        data: serde_json::Value,
    ) {
        let event = Event::new(event_type, project_id, resource_id, data);
        self.publish(event);
    }

    /// Subscribe to all events
    pub fn subscribe(&self) -> EventSubscriber {
        EventSubscriber::new(self.sender.subscribe())
    }

    /// Get the number of active subscribers
    pub fn subscriber_count(&self) -> usize {
        self.sender.receiver_count()
    }
}

impl Default for EventPublisher {
    fn default() -> Self {
        Self::new()
    }
}

/// Event subscriber that receives events from the publisher
pub struct EventSubscriber {
    receiver: broadcast::Receiver<Event>,
    /// Channels this subscriber is interested in (empty = all)
    channels: Vec<String>,
    /// Project ID filter (None = all projects)
    project_id: Option<Uuid>,
}

impl EventSubscriber {
    fn new(receiver: broadcast::Receiver<Event>) -> Self {
        Self {
            receiver,
            channels: Vec::new(),
            project_id: None,
        }
    }

    /// Set the project ID filter
    pub fn for_project(mut self, project_id: Uuid) -> Self {
        self.project_id = Some(project_id);
        self
    }

    /// Subscribe to specific channels
    pub fn with_channels(mut self, channels: Vec<String>) -> Self {
        self.channels = channels;
        self
    }

    /// Add a channel subscription
    pub fn subscribe_channel(&mut self, channel: String) {
        if !self.channels.contains(&channel) {
            self.channels.push(channel);
        }
    }

    /// Remove a channel subscription
    pub fn unsubscribe_channel(&mut self, channel: &str) {
        self.channels.retain(|c| c != channel);
    }

    /// Get subscribed channels
    pub fn channels(&self) -> &[String] {
        &self.channels
    }

    /// Check if an event matches the subscription filters
    fn matches(&self, event: &Event) -> bool {
        // Check project filter
        if let Some(project_id) = self.project_id {
            if event.project_id != project_id {
                return false;
            }
        }

        // Check channel filter (empty = all channels)
        if self.channels.is_empty() {
            return true;
        }

        // Check if event matches any subscribed channel
        self.channels.iter().any(|ch| event.matches_channel(ch))
    }

    /// Receive the next event that matches the subscription
    pub async fn recv(&mut self) -> Option<Event> {
        loop {
            match self.receiver.recv().await {
                Ok(event) => {
                    if self.matches(&event) {
                        return Some(event);
                    }
                    // Event didn't match filters, continue waiting
                }
                Err(broadcast::error::RecvError::Lagged(n)) => {
                    warn!("Event subscriber lagged, missed {} events", n);
                    // Continue receiving
                }
                Err(broadcast::error::RecvError::Closed) => {
                    return None;
                }
            }
        }
    }

    /// Try to receive an event without blocking
    pub fn try_recv(&mut self) -> Option<Event> {
        loop {
            match self.receiver.try_recv() {
                Ok(event) => {
                    if self.matches(&event) {
                        return Some(event);
                    }
                    // Event didn't match, try again
                }
                Err(broadcast::error::TryRecvError::Empty) => return None,
                Err(broadcast::error::TryRecvError::Lagged(n)) => {
                    warn!("Event subscriber lagged, missed {} events", n);
                    // Continue trying
                }
                Err(broadcast::error::TryRecvError::Closed) => return None,
            }
        }
    }
}

/// Shared event publisher wrapped in Arc for use in AppState
pub type SharedEventPublisher = Arc<EventPublisher>;

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_event_publish_subscribe() {
        let publisher = EventPublisher::new();
        let mut subscriber = publisher.subscribe();

        let project_id = Uuid::new_v4();
        let event = Event::new(
            EventType::DocumentUploaded,
            project_id,
            "doc123",
            serde_json::json!({"name": "test.pdf"}),
        );

        publisher.publish(event.clone());

        let received = subscriber.try_recv();
        assert!(received.is_some());
        assert_eq!(received.unwrap().resource_id, "doc123");
    }

    #[tokio::test]
    async fn test_channel_filtering() {
        let publisher = EventPublisher::new();
        let mut subscriber = publisher
            .subscribe()
            .with_channels(vec!["document:*".to_string()]);

        let project_id = Uuid::new_v4();

        // This should match
        publisher.emit(
            EventType::DocumentUploaded,
            project_id,
            "doc1",
            serde_json::json!({}),
        );

        // This should NOT match
        publisher.emit(
            EventType::CollectionCreated,
            project_id,
            "my_collection",
            serde_json::json!({}),
        );

        let received = subscriber.try_recv();
        assert!(received.is_some());
        assert_eq!(received.unwrap().event_type, EventType::DocumentUploaded);

        // Collection event should not be received
        let received = subscriber.try_recv();
        assert!(received.is_none());
    }

    #[test]
    fn test_event_channel_matching() {
        let event = Event::new(
            EventType::DocumentProcessed,
            Uuid::new_v4(),
            "doc123",
            serde_json::json!({}),
        );

        assert!(event.matches_channel("document:doc123"));
        assert!(event.matches_channel("document:*"));
        assert!(!event.matches_channel("collection:doc123"));
        assert!(!event.matches_channel("document:other"));
    }
}
