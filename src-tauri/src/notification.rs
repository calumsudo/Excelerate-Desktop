use serde::{Serialize, Deserialize};
use tauri::{AppHandle, Emitter};

/// Notification types that can be sent from backend to frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NotificationType {
    Success,
    Error,
    Warning,
    Info,
}

/// Notification payload sent to the frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotificationPayload {
    pub notification_type: NotificationType,
    pub title: String,
    pub description: Option<String>,
    pub duration: Option<u32>,
}

/// File validation error details
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationError {
    pub field: String,
    pub expected: String,
    pub found: String,
    pub line: Option<usize>,
    pub column: Option<usize>,
}

/// File validation result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationResult {
    pub is_valid: bool,
    pub errors: Vec<ValidationError>,
    pub warnings: Vec<String>,
}

impl ValidationResult {
    pub fn valid() -> Self {
        Self {
            is_valid: true,
            errors: Vec::new(),
            warnings: Vec::new(),
        }
    }
    
    pub fn invalid(errors: Vec<ValidationError>) -> Self {
        Self {
            is_valid: false,
            errors,
            warnings: Vec::new(),
        }
    }
    
    pub fn with_warnings(mut self, warnings: Vec<String>) -> Self {
        self.warnings = warnings;
        self
    }
    
    pub fn add_error(&mut self, error: ValidationError) {
        self.is_valid = false;
        self.errors.push(error);
    }
    
    pub fn add_warning(&mut self, warning: String) {
        self.warnings.push(warning);
    }
    
    /// Convert validation result to notification payload
    pub fn to_notification(&self, file_name: &str) -> NotificationPayload {
        if self.is_valid {
            if !self.warnings.is_empty() {
                NotificationPayload {
                    notification_type: NotificationType::Warning,
                    title: format!("File validated with warnings: {}", file_name),
                    description: Some(self.warnings.join(", ")),
                    duration: Some(5000),
                }
            } else {
                NotificationPayload {
                    notification_type: NotificationType::Success,
                    title: format!("File validated successfully: {}", file_name),
                    description: None,
                    duration: Some(3000),
                }
            }
        } else {
            // Count missing columns
            let missing_columns: Vec<&ValidationError> = self.errors.iter()
                .filter(|e| e.field == "Column" && e.found == "Missing")
                .collect();
            
            let (title, description) = if missing_columns.len() >= 3 {
                // If 3 or more columns are missing, it's probably the wrong file type
                (
                    "Wrong file type".to_string(),
                    format!("This doesn't appear to be the correct file format for this funder. Please check that you've selected the right file.")
                )
            } else if missing_columns.len() > 0 {
                // If 1-2 columns are missing, list them specifically
                let missing_names: Vec<String> = missing_columns.iter()
                    .map(|e| format!("'{}'", e.expected))
                    .collect();
                (
                    "Missing required columns".to_string(),
                    format!("File is missing: {}", missing_names.join(", "))
                )
            } else if self.errors.len() == 1 {
                // Single non-column error
                (
                    "Validation error".to_string(),
                    format!("{}: Expected '{}', found '{}'", 
                        self.errors[0].field,
                        self.errors[0].expected,
                        self.errors[0].found
                    )
                )
            } else {
                // Multiple misc errors
                (
                    "File format issues".to_string(),
                    format!("Found {} issues with the file structure. Please check the file format.", 
                        self.errors.len()
                    )
                )
            };
            
            NotificationPayload {
                notification_type: NotificationType::Error,
                title,
                description: Some(description),
                duration: None, // No duration for errors - require manual dismissal
            }
        }
    }
}

/// Notification manager for sending notifications to frontend
pub struct NotificationManager;

impl NotificationManager {
    /// Send a notification to the frontend
    pub fn send(app_handle: &AppHandle, notification: NotificationPayload) -> Result<(), String> {
        app_handle
            .emit("backend-notification", notification)
            .map_err(|e| format!("Failed to send notification: {}", e))
    }
    
    /// Send a success notification
    pub fn success(app_handle: &AppHandle, title: impl Into<String>, description: Option<String>) -> Result<(), String> {
        Self::send(app_handle, NotificationPayload {
            notification_type: NotificationType::Success,
            title: title.into(),
            description,
            duration: Some(3000),
        })
    }
    
    /// Send an error notification
    pub fn error(app_handle: &AppHandle, title: impl Into<String>, description: Option<String>) -> Result<(), String> {
        Self::send(app_handle, NotificationPayload {
            notification_type: NotificationType::Error,
            title: title.into(),
            description,
            duration: None, // No duration for errors - require manual dismissal
        })
    }
    
    /// Send a warning notification
    pub fn warning(app_handle: &AppHandle, title: impl Into<String>, description: Option<String>) -> Result<(), String> {
        Self::send(app_handle, NotificationPayload {
            notification_type: NotificationType::Warning,
            title: title.into(),
            description,
            duration: Some(5000),
        })
    }
    
    /// Send an info notification
    pub fn info(app_handle: &AppHandle, title: impl Into<String>, description: Option<String>) -> Result<(), String> {
        Self::send(app_handle, NotificationPayload {
            notification_type: NotificationType::Info,
            title: title.into(),
            description,
            duration: Some(4000),
        })
    }
}

/// Trait for validating file structures
pub trait FileValidator {
    fn validate(&self, file_path: &std::path::Path) -> Result<ValidationResult, String>;
}