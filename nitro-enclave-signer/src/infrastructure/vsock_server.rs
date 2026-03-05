// vsock HTTP Server
//
// HTTP server that listens on a vsock socket inside the Nitro Enclave.
// For local development, falls back to TCP listening.
// Routes:
//   POST /sign  — accepts TransactionIntent, returns SignedResponse
//   GET /health — returns health status

use std::net::SocketAddr;
use std::sync::Arc;

use http_body_util::{BodyExt, Full};
use hyper::body::Bytes;
use hyper::server::conn::http1;
use hyper::service::service_fn;
use hyper::{Method, Request, Response, StatusCode};
use hyper_util::rt::TokioIo;
use tokio::net::TcpListener;
use tracing::{error, info, instrument};

use crate::application::sign_intent::SignIntentUseCase;
use crate::domain::TransactionIntent;

type BoxBody = Full<Bytes>;

/// Start the HTTP server on TCP (for local dev) or vsock (for enclave).
pub async fn start_server(
    use_case: Arc<SignIntentUseCase>,
    port: u16,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    let listener = TcpListener::bind(addr).await?;
    info!("SPQE Enclave Signer listening on {}", addr);

    loop {
        let (stream, remote_addr) = listener.accept().await?;
        let io = TokioIo::new(stream);
        let use_case = use_case.clone();

        tokio::task::spawn(async move {
            let service = service_fn(move |req| {
                let use_case = use_case.clone();
                handle_request(req, use_case)
            });

            if let Err(err) = http1::Builder::new()
                .serve_connection(io, service)
                .await
            {
                error!("Connection error from {}: {}", remote_addr, err);
            }
        });
    }
}

#[instrument(skip(req, use_case), fields(method = %req.method(), uri = %req.uri()))]
async fn handle_request(
    req: Request<hyper::body::Incoming>,
    use_case: Arc<SignIntentUseCase>,
) -> Result<Response<BoxBody>, hyper::Error> {
    match (req.method(), req.uri().path()) {
        (&Method::POST, "/sign") => handle_sign(req, use_case).await,
        (&Method::GET, "/health") => handle_health().await,
        _ => Ok(not_found()),
    }
}

async fn handle_sign(
    req: Request<hyper::body::Incoming>,
    use_case: Arc<SignIntentUseCase>,
) -> Result<Response<BoxBody>, hyper::Error> {
    // Collect the request body
    let body_bytes = req.collect().await?.to_bytes();

    let intent: TransactionIntent = match serde_json::from_slice(&body_bytes) {
        Ok(intent) => intent,
        Err(e) => {
            return Ok(json_response(
                StatusCode::BAD_REQUEST,
                &serde_json::json!({ "error": format!("Invalid JSON: {}", e) }),
            ));
        }
    };

    match use_case.execute(intent).await {
        Ok(response) => Ok(json_response(StatusCode::OK, &response)),
        Err(e) => {
            error!("Sign intent failed: {}", e);
            Ok(json_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                &serde_json::json!({ "error": e.to_string() }),
            ))
        }
    }
}

async fn handle_health() -> Result<Response<BoxBody>, hyper::Error> {
    Ok(json_response(
        StatusCode::OK,
        &serde_json::json!({
            "status": "ok",
            "service": "spqe-enclave-signer",
            "version": "0.1.0",
            "algorithm": "ML-DSA-65"
        }),
    ))
}

fn json_response(status: StatusCode, body: &serde_json::Value) -> Response<BoxBody> {
    let json = serde_json::to_string(body).unwrap_or_default();
    Response::builder()
        .status(status)
        .header("Content-Type", "application/json")
        .body(Full::new(Bytes::from(json)))
        .unwrap()
}

fn not_found() -> Response<BoxBody> {
    Response::builder()
        .status(StatusCode::NOT_FOUND)
        .body(Full::new(Bytes::from("Not Found")))
        .unwrap()
}
