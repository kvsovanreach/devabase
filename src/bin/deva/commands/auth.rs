//! Authentication commands

use crate::client::ApiClient;
use crate::config::Config;
use crate::output::{self, OutputFormat, TableDisplay};
use clap::Args;
use serde::{Deserialize, Serialize};

#[derive(Args)]
pub struct LoginArgs {
    /// Email address
    #[arg(short, long)]
    pub email: Option<String>,

    /// Password (will prompt if not provided)
    #[arg(short, long)]
    pub password: Option<String>,

    /// API key (alternative to email/password)
    #[arg(short, long)]
    pub api_key: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct LoginRequest {
    email: String,
    password: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct AuthResponse {
    user: User,
    token: String,
    refresh_token: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct User {
    id: String,
    email: String,
    name: String,
}

impl TableDisplay for User {
    fn print_table(&self) {
        output::print_kv(&[
            ("ID", self.id.clone()),
            ("Email", self.email.clone()),
            ("Name", self.name.clone()),
        ]);
    }
}

pub async fn login(config: &mut Config, args: LoginArgs) -> Result<(), Box<dyn std::error::Error>> {
    // If API key is provided, validate and store it
    if let Some(api_key) = args.api_key {
        config.token = Some(api_key);
        config.save()?;
        output::success("Logged in with API key");
        return Ok(());
    }

    // Get email and password
    let email = args.email.unwrap_or_else(|| output::prompt("Email"));
    let password = args.password.unwrap_or_else(|| output::prompt_password("Password"));

    if email.is_empty() || password.is_empty() {
        return Err("Email and password are required".into());
    }

    // Create client without auth for login
    let client = reqwest::Client::new();
    let url = format!("{}/v1/auth/login", config.api_url);

    let response = client
        .post(&url)
        .json(&LoginRequest { email: email.clone(), password })
        .send()
        .await?;

    if !response.status().is_success() {
        let error: serde_json::Value = response.json().await?;
        let msg = error.get("error")
            .or(error.get("message"))
            .map(|v| v.to_string())
            .unwrap_or_else(|| "Login failed".to_string());
        return Err(msg.into());
    }

    let auth: AuthResponse = response.json().await?;

    // Save credentials
    config.token = Some(auth.token);
    config.refresh_token = Some(auth.refresh_token);
    config.user_email = Some(email);
    config.save()?;

    output::success(format!("Logged in as {}", auth.user.email));
    Ok(())
}

pub async fn logout(config: &mut Config) -> Result<(), Box<dyn std::error::Error>> {
    config.clear_auth();
    config.save()?;
    output::success("Logged out");
    Ok(())
}

pub async fn whoami(config: &Config, format: OutputFormat) -> Result<(), Box<dyn std::error::Error>> {
    if !config.is_authenticated() {
        return Err("Not logged in. Run 'deva login' first.".into());
    }

    let client = ApiClient::new(config);
    let user: User = client.get("/auth/me").await?;

    output::print_data(&user, format);
    Ok(())
}
