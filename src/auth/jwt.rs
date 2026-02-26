use crate::{Error, Result};
use chrono::{Duration, Utc};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,       // Subject (user/key ID)
    pub exp: i64,          // Expiration time
    pub iat: i64,          // Issued at
    pub scopes: Vec<String>,
}

pub fn create_token(
    secret: &str,
    subject: Uuid,
    scopes: Vec<String>,
    expiry_hours: u64,
) -> Result<String> {
    let now = Utc::now();
    let exp = now + Duration::hours(expiry_hours as i64);

    let claims = Claims {
        sub: subject.to_string(),
        exp: exp.timestamp(),
        iat: now.timestamp(),
        scopes,
    };

    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .map_err(|e| Error::Auth(format!("Failed to create token: {}", e)))
}

pub fn verify_token(secret: &str, token: &str) -> Result<Claims> {
    let token_data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::default(),
    )
    .map_err(|e| Error::Auth(format!("Invalid token: {}", e)))?;

    Ok(token_data.claims)
}

#[derive(Debug, Serialize)]
pub struct TokenResponse {
    pub token: String,
    pub expires_at: i64,
    pub token_type: String,
}
