use crate::auth::AuthContext;
use crate::server::{websocket::handle_websocket, AppState};
use crate::Error;
use axum::{
    extract::{State, WebSocketUpgrade},
    response::IntoResponse,
};
use std::sync::Arc;

/// WebSocket upgrade endpoint for realtime events
///
/// ## Authentication
/// Requires a valid Bearer token (JWT or API key)
///
/// ## WebSocket Protocol
///
/// ### Client Messages
/// ```json
/// // Subscribe to channels
/// { "type": "subscribe", "channels": ["document:*", "collection:my_docs"] }
///
/// // Unsubscribe from channels
/// { "type": "unsubscribe", "channels": ["document:*"] }
///
/// // Keep-alive ping
/// { "type": "ping" }
/// ```
///
/// ### Server Messages
/// ```json
/// // Subscription confirmed
/// { "type": "subscribed", "channels": ["document:*"] }
///
/// // Event notification
/// {
///   "type": "event",
///   "channel": "document:abc123",
///   "event": "document.processed",
///   "data": { "status": "processed", "chunk_count": 15 },
///   "timestamp": "2024-01-15T10:30:00Z"
/// }
///
/// // Error
/// { "type": "error", "message": "Invalid channel name" }
///
/// // Pong response
/// { "type": "pong" }
/// ```
///
/// ### Channel Formats
/// - `document:*` - All document events
/// - `document:{id}` - Specific document events
/// - `collection:*` - All collection events
/// - `collection:{name}` - Specific collection events
/// - `vector:*` - All vector events
/// - `table:*` - All user table events
/// - `project:{id}` - All events for a project
pub async fn ws_upgrade(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
    auth: AuthContext,
) -> Result<impl IntoResponse, Error> {
    // Must have a project context
    let project_id = auth.project_id.ok_or_else(|| {
        Error::Auth("X-Project-ID header required for realtime connection".to_string())
    })?;

    // Must have a user context (not just API key)
    let user_id = auth.user_id.ok_or_else(|| {
        Error::Auth("User authentication required for realtime connection".to_string())
    })?;

    // Create subscriber filtered to this project
    let subscriber = state.events.subscribe().for_project(project_id);

    Ok(ws.on_upgrade(move |socket| async move {
        handle_websocket(socket, subscriber, project_id, user_id).await;
    }))
}
