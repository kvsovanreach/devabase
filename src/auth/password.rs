use crate::{Error, Result};
use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};

/// Hash a password using Argon2
pub fn hash_password(password: &str) -> Result<String> {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    let hash = argon2
        .hash_password(password.as_bytes(), &salt)
        .map_err(|e| Error::Internal(format!("Failed to hash password: {}", e)))?;
    Ok(hash.to_string())
}

/// Verify a password against a hash
pub fn verify_password(password: &str, hash: &str) -> bool {
    let parsed_hash = match PasswordHash::new(hash) {
        Ok(h) => h,
        Err(_) => return false,
    };
    Argon2::default()
        .verify_password(password.as_bytes(), &parsed_hash)
        .is_ok()
}

/// Validate password strength
pub fn validate_password(password: &str) -> Result<()> {
    if password.len() < 8 {
        return Err(Error::BadRequest("Password must be at least 8 characters".to_string()));
    }
    if password.len() > 128 {
        return Err(Error::BadRequest("Password must be at most 128 characters".to_string()));
    }
    Ok(())
}

/// Validate email format
pub fn validate_email(email: &str) -> Result<()> {
    if email.is_empty() {
        return Err(Error::BadRequest("Email is required".to_string()));
    }
    if !email.contains('@') || !email.contains('.') {
        return Err(Error::BadRequest("Invalid email format".to_string()));
    }
    if email.len() > 320 {
        return Err(Error::BadRequest("Email is too long".to_string()));
    }
    Ok(())
}
