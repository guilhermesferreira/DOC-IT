import os
import datetime
from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.backends import default_backend
import ipaddress

# Set the directory for certificates relative to this script
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CERTS_DIR = os.path.join(SCRIPT_DIR, '..', 'certs')

def ensure_dir(directory):
    if not os.path.exists(directory):
        os.makedirs(directory)

def generate_key():
    return rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048,
        backend=default_backend()
    )

def save_key(key, filename):
    path = os.path.join(CERTS_DIR, filename)
    with open(path, "wb") as f:
        f.write(key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.TraditionalOpenSSL,
            encryption_algorithm=serialization.NoEncryption(),
        ))
    print(f"Saved key to {path}")

def save_cert(cert, filename):
    path = os.path.join(CERTS_DIR, filename)
    with open(path, "wb") as f:
        f.write(cert.public_bytes(serialization.Encoding.PEM))
    print(f"Saved cert to {path}")

def generate_root_ca():
    print("Generating Root CA...")
    key = generate_key()
    
    subject = issuer = x509.Name([
        x509.NameAttribute(NameOID.COUNTRY_NAME, u"BR"),
        x509.NameAttribute(NameOID.STATE_OR_PROVINCE_NAME, u"Sao Paulo"),
        x509.NameAttribute(NameOID.LOCALITY_NAME, u"Sao Paulo"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, u"Doc-IT CA"),
        x509.NameAttribute(NameOID.COMMON_NAME, u"Doc-IT Root CA"),
    ])

    cert = x509.CertificateBuilder().subject_name(
        subject
    ).issuer_name(
        issuer
    ).public_key(
        key.public_key()
    ).serial_number(
        x509.random_serial_number()
    ).not_valid_before(
        datetime.datetime.utcnow()
    ).not_valid_after(
        datetime.datetime.utcnow() + datetime.timedelta(days=3650) # 10 years
    ).add_extension(
        x509.BasicConstraints(ca=True, path_length=None), critical=True,
    ).sign(key, hashes.SHA256(), default_backend())

    save_key(key, "ca.key")
    save_cert(cert, "ca.crt")
    return key, cert

def generate_signed_cert(filename_base, common_name, ca_key, ca_cert, is_server=False):
    print(f"Generating certificate for {common_name} ({filename_base})...")
    key = generate_key()
    
    subject = x509.Name([
        x509.NameAttribute(NameOID.COUNTRY_NAME, u"BR"),
        x509.NameAttribute(NameOID.STATE_OR_PROVINCE_NAME, u"Sao Paulo"),
        x509.NameAttribute(NameOID.LOCALITY_NAME, u"Sao Paulo"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, u"Doc-IT"),
        x509.NameAttribute(NameOID.COMMON_NAME, common_name),
    ])

    builder = x509.CertificateBuilder().subject_name(
        subject
    ).issuer_name(
        ca_cert.subject
    ).public_key(
        key.public_key()
    ).serial_number(
        x509.random_serial_number()
    ).not_valid_before(
        datetime.datetime.utcnow()
    ).not_valid_after(
        datetime.datetime.utcnow() + datetime.timedelta(days=365) # 1 year
    )

    if is_server:
        # Add SANs for localhost
        builder = builder.add_extension(
            x509.SubjectAlternativeName([
                x509.DNSName(u"localhost"),
                x509.IPAddress(ipaddress.IPv4Address(u"127.0.0.1"))
            ]),
            critical=False,
        )
    else:
        # Client auth usage
        builder = builder.add_extension(
            x509.ExtendedKeyUsage([x509.ExtendedKeyUsageOID.CLIENT_AUTH]),
            critical=False
        )

    cert = builder.sign(ca_key, hashes.SHA256(), default_backend())
    
    save_key(key, f"{filename_base}.key")
    save_cert(cert, f"{filename_base}.crt")

def main():
    ensure_dir(CERTS_DIR)
    
    ca_key_path = os.path.join(CERTS_DIR, "ca.key")
    ca_cert_path = os.path.join(CERTS_DIR, "ca.crt")

    # Check if CA exists
    if os.path.exists(ca_key_path) and os.path.exists(ca_cert_path):
        print("Loading existing CA...")
        with open(ca_key_path, "rb") as f:
            ca_key = serialization.load_pem_private_key(
                f.read(),
                password=None,
                backend=default_backend()
            )
        with open(ca_cert_path, "rb") as f:
            ca_cert = x509.load_pem_x509_certificate(f.read(), default_backend())
    else:
        ca_key, ca_cert = generate_root_ca()

    # Generate Server Cert
    generate_signed_cert("server", u"localhost", ca_key, ca_cert, is_server=True)

    # Generate Agent Cert (Generic)
    generate_signed_cert("agent", u"doc-it-agent-generic", ca_key, ca_cert, is_server=False)

if __name__ == "__main__":
    main()
