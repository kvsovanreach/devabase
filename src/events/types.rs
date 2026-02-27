use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Event types that can be published
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EventType {
    // Document events
    DocumentUploaded,
    DocumentProcessing,
    DocumentProcessed,
    DocumentFailed,
    DocumentDeleted,

    // Collection events
    CollectionCreated,
    CollectionDeleted,

    // Vector events
    VectorUpserted,
    VectorDeleted,

    // User table events (for auto-generated API)
    TableCreated,
    TableDeleted,
    TableRowCreated,
    TableRowUpdated,
    TableRowDeleted,

    // App user auth events
    AppUserRegistered,
    AppUserLoggedIn,
    AppPasswordResetRequested,
    AppEmailVerificationRequested,
}

impl EventType {
    /// Convert to string representation for filtering
    pub fn as_str(&self) -> &'static str {
        match self {
            EventType::DocumentUploaded => "document.uploaded",
            EventType::DocumentProcessing => "document.processing",
            EventType::DocumentProcessed => "document.processed",
            EventType::DocumentFailed => "document.failed",
            EventType::DocumentDeleted => "document.deleted",
            EventType::CollectionCreated => "collection.created",
            EventType::CollectionDeleted => "collection.deleted",
            EventType::VectorUpserted => "vector.upserted",
            EventType::VectorDeleted => "vector.deleted",
            EventType::TableCreated => "table.created",
            EventType::TableDeleted => "table.deleted",
            EventType::TableRowCreated => "table.row.created",
            EventType::TableRowUpdated => "table.row.updated",
            EventType::TableRowDeleted => "table.row.deleted",
            EventType::AppUserRegistered => "app.user.registered",
            EventType::AppUserLoggedIn => "app.user.logged_in",
            EventType::AppPasswordResetRequested => "app.password.reset_requested",
            EventType::AppEmailVerificationRequested => "app.email.verification_requested",
        }
    }

    /// Parse from string
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "document.uploaded" => Some(EventType::DocumentUploaded),
            "document.processing" => Some(EventType::DocumentProcessing),
            "document.processed" => Some(EventType::DocumentProcessed),
            "document.failed" => Some(EventType::DocumentFailed),
            "document.deleted" => Some(EventType::DocumentDeleted),
            "collection.created" => Some(EventType::CollectionCreated),
            "collection.deleted" => Some(EventType::CollectionDeleted),
            "vector.upserted" => Some(EventType::VectorUpserted),
            "vector.deleted" => Some(EventType::VectorDeleted),
            "table.created" => Some(EventType::TableCreated),
            "table.deleted" => Some(EventType::TableDeleted),
            "table.row.created" => Some(EventType::TableRowCreated),
            "table.row.updated" => Some(EventType::TableRowUpdated),
            "table.row.deleted" => Some(EventType::TableRowDeleted),
            "app.user.registered" => Some(EventType::AppUserRegistered),
            "app.user.logged_in" => Some(EventType::AppUserLoggedIn),
            "app.password.reset_requested" => Some(EventType::AppPasswordResetRequested),
            "app.email.verification_requested" => Some(EventType::AppEmailVerificationRequested),
            _ => None,
        }
    }

    /// Get the resource type prefix for channel matching
    pub fn resource_type(&self) -> &'static str {
        match self {
            EventType::DocumentUploaded
            | EventType::DocumentProcessing
            | EventType::DocumentProcessed
            | EventType::DocumentFailed
            | EventType::DocumentDeleted => "document",
            EventType::CollectionCreated | EventType::CollectionDeleted => "collection",
            EventType::VectorUpserted | EventType::VectorDeleted => "vector",
            EventType::TableCreated | EventType::TableDeleted => "table",
            EventType::TableRowCreated | EventType::TableRowUpdated | EventType::TableRowDeleted => {
                "table"
            }
            EventType::AppUserRegistered
            | EventType::AppUserLoggedIn
            | EventType::AppPasswordResetRequested
            | EventType::AppEmailVerificationRequested => "app",
        }
    }
}

impl std::fmt::Display for EventType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

/// An event that can be published to subscribers
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Event {
    /// Unique event ID
    pub id: Uuid,
    /// Type of event
    pub event_type: EventType,
    /// Project this event belongs to
    pub project_id: Uuid,
    /// Resource ID (document_id, collection name, etc.)
    pub resource_id: String,
    /// Event payload data
    pub data: serde_json::Value,
    /// When the event occurred
    pub timestamp: DateTime<Utc>,
}

impl Event {
    /// Create a new event
    pub fn new(
        event_type: EventType,
        project_id: Uuid,
        resource_id: impl Into<String>,
        data: serde_json::Value,
    ) -> Self {
        Self {
            id: Uuid::new_v4(),
            event_type,
            project_id,
            resource_id: resource_id.into(),
            timestamp: Utc::now(),
            data,
        }
    }

    /// Get the channel name for this event
    /// Format: "{resource_type}:{resource_id}" or "project:{project_id}" for project-wide
    pub fn channel(&self) -> String {
        format!("{}:{}", self.event_type.resource_type(), self.resource_id)
    }

    /// Check if this event matches a channel pattern
    /// Supports wildcards: "document:*" matches all document events
    pub fn matches_channel(&self, pattern: &str) -> bool {
        let channel = self.channel();

        // Exact match
        if channel == pattern {
            return true;
        }

        // Wildcard match: "document:*" matches "document:abc123"
        if pattern.ends_with(":*") {
            let prefix = &pattern[..pattern.len() - 1]; // "document:"
            return channel.starts_with(prefix);
        }

        // Project-wide match
        if pattern == format!("project:{}", self.project_id) {
            return true;
        }

        false
    }
}
