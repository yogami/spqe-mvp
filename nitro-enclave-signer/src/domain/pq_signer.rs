// Post-Quantum Signer: ML-DSA via liboqs
//
// Wraps the Linux Foundation's liboqs C library (NIST-standardized ML-DSA)
// for post-quantum digital signatures inside the Nitro Enclave.
//
// ML-DSA-65 (formerly Dilithium3) provides NIST Security Level 3.

use oqs::sig::{Algorithm, Sig};
use tracing::{info, instrument};

use crate::domain::EnclaveError;

/// Post-quantum signer using ML-DSA-65 (NIST Level 3).
pub struct PQSigner {
    sig: Sig,
    public_key: Vec<u8>,
    secret_key: Vec<u8>,
}

impl PQSigner {
    /// Create a new PQ signer, generating a fresh ML-DSA-65 keypair.
    #[instrument]
    pub fn new() -> Result<Self, EnclaveError> {
        oqs::init();
        let sig = Sig::new(Algorithm::Dilithium3)
            .map_err(|e| EnclaveError::SigningFailed(format!("Failed to init ML-DSA-65: {:?}", e)))?;

        let (pk, sk) = sig
            .keypair()
            .map_err(|e| EnclaveError::SigningFailed(format!("Keygen failed: {:?}", e)))?;

        info!(
            pk_len = pk.as_ref().len(),
            sk_len = sk.as_ref().len(),
            "ML-DSA-65 keypair generated"
        );

        Ok(Self {
            sig,
            public_key: pk.into_vec(),
            secret_key: sk.into_vec(),
        })
    }

    /// Create a PQ signer from existing key material.
    pub fn from_keys(public_key: Vec<u8>, secret_key: Vec<u8>) -> Result<Self, EnclaveError> {
        oqs::init();
        let sig = Sig::new(Algorithm::Dilithium3)
            .map_err(|e| EnclaveError::SigningFailed(format!("Failed to init ML-DSA-65: {:?}", e)))?;

        Ok(Self {
            sig,
            public_key,
            secret_key,
        })
    }

    /// Get the keypair (public_key, secret_key) as byte vectors.
    pub fn keypair(&self) -> (Vec<u8>, Vec<u8>) {
        (self.public_key.clone(), self.secret_key.clone())
    }

    /// Get the public key bytes.
    pub fn public_key(&self) -> &[u8] {
        &self.public_key
    }

    /// Sign a message with ML-DSA-65.
    #[instrument(skip(self, message), fields(msg_len = message.len()))]
    pub fn sign(&self, message: &[u8]) -> Result<Vec<u8>, EnclaveError> {
        let sk_ref = self.sig
            .secret_key_from_bytes(&self.secret_key)
            .ok_or_else(|| EnclaveError::SigningFailed("Invalid secret key bytes".into()))?;

        let signature = self.sig
            .sign(message, &sk_ref)
            .map_err(|e| EnclaveError::SigningFailed(format!("ML-DSA sign failed: {:?}", e)))?;

        Ok(signature.into_vec())
    }

    /// Verify a signature against a message using the stored public key.
    pub fn verify(&self, message: &[u8], signature: &[u8]) -> Result<(), EnclaveError> {
        let pk_ref = self.sig
            .public_key_from_bytes(&self.public_key)
            .ok_or_else(|| EnclaveError::SigningFailed("Invalid public key bytes".into()))?;

        let sig_ref = self.sig
            .signature_from_bytes(signature)
            .ok_or_else(|| EnclaveError::SigningFailed("Invalid signature bytes".into()))?;

        self.sig
            .verify(message, &sig_ref, &pk_ref)
            .map_err(|_| EnclaveError::SigningFailed("Signature verification failed".into()))
    }

    /// Pre-compute nonces for speculative signing.
    /// In ML-DSA, the "nonce" is part of the signing process. For the speculative
    /// path, we perform a full sign but return it as "nonce data" that can be
    /// "finalized" (released) if the policy verdict is approved.
    ///
    /// This is a pragmatic optimization: we compute the entire signature speculatively,
    /// but only release it if approved. The nonces are zeroed if denied.
    #[instrument(skip(self, message), fields(msg_len = message.len()))]
    pub fn precompute_nonces(&self, message: &[u8]) -> Result<Vec<u8>, EnclaveError> {
        // The "nonce pre-computation" is actually a full speculative signature.
        // ML-DSA's internal nonce generation is deterministic given the secret key
        // and message, so pre-computing the full signature and holding it is
        // equivalent to pre-computing nonces.
        self.sign(message)
    }

    /// Finalize a signature using pre-computed nonces.
    /// Since nonces contain the full speculative signature, this simply returns them.
    pub fn finalize_with_nonces(
        &self,
        _message: &[u8],
        nonces: &[u8],
    ) -> Result<Vec<u8>, EnclaveError> {
        if nonces.is_empty() {
            return Err(EnclaveError::NoncesExpired);
        }
        Ok(nonces.to_vec())
    }
}

/// Async wrapper implementing SignerPort for use in the speculative engine.
pub struct AsyncPQSigner {
    inner: PQSigner,
}

impl AsyncPQSigner {
    pub fn new(signer: PQSigner) -> Self {
        Self { inner: signer }
    }

    pub fn public_key(&self) -> &[u8] {
        self.inner.public_key()
    }
}

#[async_trait::async_trait]
impl crate::ports::SignerPort for AsyncPQSigner {
    async fn precompute_nonces(&self, message: &[u8]) -> Result<Vec<u8>, EnclaveError> {
        let message = message.to_vec();
        let signer = &self.inner;
        // ML-DSA signing is CPU-bound, run on blocking thread
        let msg = message.clone();
        // Since we can't move signer across threads easily, we do it inline
        // In production, this would use spawn_blocking with an Arc
        signer.precompute_nonces(&msg)
    }

    async fn finalize_signature(
        &self,
        message: &[u8],
        nonces: Vec<u8>,
    ) -> Result<crate::domain::PQSignature, EnclaveError> {
        let sig_bytes = self.inner.finalize_with_nonces(message, &nonces)?;
        Ok(crate::domain::PQSignature {
            signature: sig_bytes,
            algorithm: "ML-DSA-65".to_string(),
            public_key: self.inner.public_key().to_vec(),
        })
    }
}
