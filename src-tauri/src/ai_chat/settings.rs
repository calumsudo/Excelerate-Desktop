//! AI provider settings (API keys, default models). Stored as JSON in the
//! app config dir — keys stay on the user's machine and never touch Supabase.

use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::Manager;

pub const DEFAULT_ANTHROPIC_MODEL: &str = "claude-opus-4-8";
pub const DEFAULT_OPENAI_MODEL: &str = "gpt-5.1";
pub const DEFAULT_GOOGLE_MODEL: &str = "gemini-2.5-pro";
pub const DEFAULT_LMSTUDIO_BASE_URL: &str = "http://localhost:1234/v1";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default)]
pub struct AiSettings {
    pub default_provider: String,
    pub anthropic_api_key: String,
    pub openai_api_key: String,
    pub google_api_key: String,
    pub anthropic_model: String,
    pub openai_model: String,
    pub google_model: String,
    /// OpenAI-compatible local server (LM Studio / Ollama).
    pub lmstudio_base_url: String,
    /// Model id as shown in LM Studio; empty until the user sets one.
    pub lmstudio_model: String,
    /// Optional — only needed when the local server has auth enabled.
    pub lmstudio_api_key: String,
}

impl AiSettings {
    fn with_defaults(mut self) -> Self {
        if self.default_provider.is_empty() {
            self.default_provider = "anthropic".into();
        }
        if self.anthropic_model.is_empty() {
            self.anthropic_model = DEFAULT_ANTHROPIC_MODEL.into();
        }
        if self.openai_model.is_empty() {
            self.openai_model = DEFAULT_OPENAI_MODEL.into();
        }
        if self.google_model.is_empty() {
            self.google_model = DEFAULT_GOOGLE_MODEL.into();
        }
        if self.lmstudio_base_url.is_empty() {
            self.lmstudio_base_url = DEFAULT_LMSTUDIO_BASE_URL.into();
        }
        self
    }

    pub fn api_key_for(&self, provider: &str) -> &str {
        match provider {
            "anthropic" => &self.anthropic_api_key,
            "openai" => &self.openai_api_key,
            "google" => &self.google_api_key,
            "lmstudio" => &self.lmstudio_api_key,
            _ => "",
        }
    }
}

fn settings_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("Cannot resolve app config dir: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("Cannot create config dir: {e}"))?;
    Ok(dir.join("ai-settings.json"))
}

pub fn load(app: &tauri::AppHandle) -> Result<AiSettings, String> {
    let path = settings_path(app)?;
    let settings = match fs::read_to_string(&path) {
        Ok(raw) => serde_json::from_str::<AiSettings>(&raw)
            .map_err(|e| format!("Corrupt AI settings file: {e}"))?,
        Err(_) => AiSettings::default(),
    };
    Ok(settings.with_defaults())
}

#[tauri::command]
pub fn get_ai_settings(app: tauri::AppHandle) -> Result<AiSettings, String> {
    load(&app)
}

#[tauri::command]
pub fn save_ai_settings(app: tauri::AppHandle, settings: AiSettings) -> Result<(), String> {
    let path = settings_path(&app)?;
    let raw = serde_json::to_string_pretty(&settings.with_defaults())
        .map_err(|e| format!("Cannot serialize settings: {e}"))?;
    fs::write(&path, raw).map_err(|e| format!("Cannot write settings file: {e}"))
}
