#!/usr/bin/env python
import os
from OpenSSL import crypto
from datetime import datetime, timedelta

def generate_self_signed_cert(cert_dir):
    """Generate a self-signed certificate for development purposes"""
    
    # Create directory if it doesn't exist
    if not os.path.exists(cert_dir):
        os.makedirs(cert_dir)
        
    key_path = os.path.join(cert_dir, "server.key")
    cert_path = os.path.join(cert_dir, "server.crt")
    
    # Check if certificates already exist
    if os.path.exists(key_path) and os.path.exists(cert_path):
        print(f"Certificates already exist at {cert_dir}")
        return key_path, cert_path
    
    # Create a key pair
    k = crypto.PKey()
    k.generate_key(crypto.TYPE_RSA, 2048)
    
    # Create a self-signed certificate
    cert = crypto.X509()
    cert.get_subject().C = "US"
    cert.get_subject().ST = "State"
    cert.get_subject().L = "City"
    cert.get_subject().O = "ByteBeats"
    cert.get_subject().OU = "Development"
    cert.get_subject().CN = "localhost"
    
    # Set alternative names for multi-device access
    san_list = ["DNS:localhost", "IP:127.0.0.1"]
    
    # Try to get the machine's IP addresses
    try:
        import socket
        hostname = socket.gethostname()
        san_list.append(f"DNS:{hostname}")
        
        # Get local IP addresses
        addrs = socket.getaddrinfo(hostname, None)
        for addr in addrs:
            ip = addr[4][0]
            if ip != '127.0.0.1' and ':' not in ip:  # Skip localhost and IPv6
                san_list.append(f"IP:{ip}")
    except Exception as e:
        print(f"Warning: Could not determine IP addresses: {e}")
    
    # Add Subject Alternative Names
    extensions = [
        crypto.X509Extension(
            b"subjectAltName", 
            False, 
            ", ".join(san_list).encode()
        )
    ]
    cert.add_extensions(extensions)
    
    # Set validity period (1 year)
    cert.gmtime_adj_notBefore(0)
    cert.gmtime_adj_notAfter(365 * 24 * 60 * 60)
    
    # Set serial number and version
    cert.set_serial_number(1000)
    cert.set_version(2)
    
    # Sign the certificate with its own private key
    cert.set_pubkey(k)
    cert.sign(k, 'sha256')
    
    # Save the key and certificate
    with open(key_path, "wb") as key_file:
        key_file.write(crypto.dump_privatekey(crypto.FILETYPE_PEM, k))
    
    with open(cert_path, "wb") as cert_file:
        cert_file.write(crypto.dump_certificate(crypto.FILETYPE_PEM, cert))
    
    print(f"Generated new self-signed certificate at {cert_dir}")
    print(f"NOTE: Since this is a self-signed certificate, browsers will show a security warning.")
    print(f"You'll need to accept the certificate in your browser or add it to your system's trusted certificates.")
    
    return key_path, cert_path

if __name__ == "__main__":
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    CERT_DIR = os.path.join(BASE_DIR, "certs")
    
    key_path, cert_path = generate_self_signed_cert(CERT_DIR)
    print(f"Certificate: {cert_path}")
    print(f"Private key: {key_path}")