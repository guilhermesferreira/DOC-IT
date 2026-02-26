#!/usr/bin/env python3
"""
=== Doc-IT Setup Wizard ===
Configurador completo do sistema Doc-IT.
Roda uma unica vez apos git clone para deixar tudo pronto: certs, banco, deps, .env.

Uso: python scripts/setup.py
"""

import os
import sys
import json
import secrets
import subprocess
import ipaddress
import time
import shutil
from pathlib import Path
from datetime import datetime, timedelta

# ─── Detectar raiz do projeto ────────────────────────────────────────────────
SCRIPT_DIR  = Path(__file__).resolve().parent        # scripts/
PROJECT_DIR = SCRIPT_DIR.parent                       # Doc-IT/
BACKEND_DIR = PROJECT_DIR / "backend"
FRONTEND_DIR = PROJECT_DIR / "frontend"
CLIENT_DIR  = PROJECT_DIR / "client"
CERTS_DIR   = BACKEND_DIR / "certs"
UPDATES_DIR = BACKEND_DIR / "updates"

# ─── Cores no terminal ──────────────────────────────────────────────────────
class C:
    HEADER  = "\033[95m"
    BLUE    = "\033[94m"
    GREEN   = "\033[92m"
    YELLOW  = "\033[93m"
    RED     = "\033[91m"
    END     = "\033[0m"
    BOLD    = "\033[1m"

def banner():
    print(f"""
{C.BLUE}{C.BOLD}╔══════════════════════════════════════════╗
║          Doc-IT Setup Wizard             ║
╚══════════════════════════════════════════╝{C.END}
""")

def step(num, msg):
    print(f"\n{C.GREEN}{C.BOLD}[{num}]{C.END} {msg}")

def warn(msg):
    print(f"  {C.YELLOW}⚠ {msg}{C.END}")

def error(msg):
    print(f"  {C.RED}✗ {msg}{C.END}")
    sys.exit(1)

def ok(msg):
    print(f"  {C.GREEN}✓ {msg}{C.END}")

def ask(prompt, default=None):
    if default:
        val = input(f"  {prompt} [{default}]: ").strip()
        return val if val else default
    else:
        val = input(f"  {prompt}: ").strip()
        if not val:
            error("Valor obrigatório. Abortando.")
        return val

def ask_password(prompt, default=None):
    """Pede senha, opcionalmente mostrando default mascarado."""
    if default:
        val = input(f"  {prompt} [****]: ").strip()
        return val if val else default
    else:
        val = input(f"  {prompt}: ").strip()
        if not val:
            error("Valor obrigatório. Abortando.")
        return val

# ─── STEP 0: Verificar dependências do sistema ──────────────────────────────
def check_system_deps():
    step(0, "Verificando dependências do sistema...")

    # Node.js
    try:
        node_v = subprocess.check_output(["node", "--version"], text=True).strip()
        ok(f"Node.js: {node_v}")
    except FileNotFoundError:
        error("Node.js não encontrado. Instale o Node.js e tente novamente.")

    # npm
    try:
        npm_v = subprocess.check_output(["npm", "--version"], text=True, shell=True).strip()
        ok(f"npm: {npm_v}")
    except FileNotFoundError:
        error("npm não encontrado.")

    # Docker
    try:
        docker_v = subprocess.check_output(["docker", "--version"], text=True).strip()
        ok(f"Docker: {docker_v}")
    except FileNotFoundError:
        error("Docker não encontrado. O PostgreSQL roda via Docker.")

    # Python cryptography
    try:
        from cryptography import x509
        ok("Python cryptography: OK")
    except ImportError:
        warn("Instalando a dependência 'cryptography' via pip...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "cryptography", "-q"])
        ok("cryptography instalado.")


# ─── STEP 1: Coletar informações ────────────────────────────────────────────
def collect_info():
    step(1, "Informações do Projeto (Whitelabel)")
    info = {}

    info["project_name"] = ask(
        "Nome do Projeto (define o nome do Agent, títulos do painel, etc.)",
        "Doc-IT"
    )

    print()
    step(2, "Configuração do Servidor")
    info["ips_hostnames"] = ask(
        "IP(s) e/ou Hostname(s) do servidor (separados por vírgula)",
        "localhost"
    )
    info["port"] = ask("Porta do backend HTTPS", "3000")

    print()
    step(3, "Configuração do Banco de Dados (PostgreSQL via Docker)")
    info["db_host"] = ask("Host do banco", "127.0.0.1")
    info["db_port"] = ask("Porta do banco", "5433")
    info["db_name"] = ask("Nome do banco", "doc_it")
    info["db_user"] = ask("Usuário do banco", "postgres")
    info["db_pass"] = ask_password("Senha do banco", "password")

    print()
    step(4, "Informações do Certificado SSL (CA + Servidor)")
    info["org"]          = ask("Nome da Organização", "Doc-IT")
    info["country"]      = ask("País (2 letras)", "BR")
    info["state"]        = ask("Estado", "Sao Paulo")
    info["city"]         = ask("Cidade", "Sao Paulo")
    info["server_cert_years"] = int(ask("Validade do server.crt em anos", "2"))
    info["agent_cert_years"]  = int(ask("Validade do cert do agente em anos", "1"))

    return info


# ─── STEP 4: Instalar dependências npm ──────────────────────────────────────
def install_npm_deps():
    step(5, "Instalando dependências npm do Backend...")
    subprocess.check_call(["npm", "install"], cwd=str(BACKEND_DIR), shell=True)
    ok("Backend: npm install concluído.")

    step("5b", "Instalando dependências npm do Frontend...")
    subprocess.check_call(["npm", "install"], cwd=str(FRONTEND_DIR), shell=True)
    ok("Frontend: npm install concluído.")


# ─── STEP 5: Gerar .env ─────────────────────────────────────────────────────
def generate_env(info):
    step(6, "Gerando backend/.env e frontend/.env...")
    project_name = info["project_name"]
    jwt_secret = secrets.token_hex(32)
    mfa_key    = secrets.token_urlsafe(32)
    db_url     = f"postgresql://{info['db_user']}:{info['db_pass']}@{info['db_host']}:{info['db_port']}/{info['db_name']}?schema=public"

    # Backend .env
    env_content = f"""DATABASE_URL="{db_url}"
JWT_SECRET="{jwt_secret}"
NODE_ENV="development"
PORT={info['port']}
PROJECT_NAME="{project_name}"
MFA_ENCRYPTION_KEY="{mfa_key}"
"""
    env_path = BACKEND_DIR / ".env"
    env_path.write_text(env_content, encoding="utf-8")
    ok(f"backend/.env salvo em {env_path}")

    # Frontend .env
    frontend_env = FRONTEND_DIR / ".env"
    frontend_env.write_text(f'VITE_PROJECT_NAME="{project_name}"\n', encoding="utf-8")
    ok(f"frontend/.env salvo em {frontend_env}")


# ─── STEP 6: Gerar Certificados PKI ─────────────────────────────────────────
def generate_pki(info):
    step(7, "Gerando PKI (CA + Server + Agent)...")

    from cryptography import x509
    from cryptography.x509.oid import NameOID
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa

    CERTS_DIR.mkdir(parents=True, exist_ok=True)

    # Parse SANs
    entries = [e.strip() for e in info["ips_hostnames"].split(",") if e.strip()]
    san_list = []
    for entry in entries:
        try:
            ip = ipaddress.ip_address(entry)
            san_list.append(x509.IPAddress(ip))
        except ValueError:
            san_list.append(x509.DNSName(entry))
    # Sempre inclui 127.0.0.1 e localhost
    if not any(isinstance(s, x509.IPAddress) and str(s.value) == "127.0.0.1" for s in san_list):
        san_list.append(x509.IPAddress(ipaddress.IPv4Address("127.0.0.1")))
    if not any(isinstance(s, x509.DNSName) and s.value == "localhost" for s in san_list):
        san_list.append(x509.DNSName("localhost"))

    subject_attrs = [
        x509.NameAttribute(NameOID.COUNTRY_NAME, info["country"]),
        x509.NameAttribute(NameOID.STATE_OR_PROVINCE_NAME, info["state"]),
        x509.NameAttribute(NameOID.LOCALITY_NAME, info["city"]),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, info["org"]),
    ]

    def _generate_key():
        return rsa.generate_private_key(public_exponent=65537, key_size=2048)

    def _save_key(key, path):
        path.write_bytes(key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.TraditionalOpenSSL,
            serialization.NoEncryption()
        ))

    def _save_cert(cert, path):
        path.write_bytes(cert.public_bytes(serialization.Encoding.PEM))

    # ─── CA (Certificate Authority) ──────────────────────────────────────
    ca_key  = _generate_key()
    ca_name = x509.Name(subject_attrs + [x509.NameAttribute(NameOID.COMMON_NAME, f"{info['org']} CA")])
    ca_cert = (
        x509.CertificateBuilder()
        .subject_name(ca_name)
        .issuer_name(ca_name)
        .public_key(ca_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(datetime.utcnow())
        .not_valid_after(datetime.utcnow() + timedelta(days=3650))  # 10 anos
        .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
        .sign(ca_key, hashes.SHA256())
    )
    _save_key(ca_key, CERTS_DIR / "ca.key")
    _save_cert(ca_cert, CERTS_DIR / "ca.crt")
    ok("CA gerado (ca.crt + ca.key) — validade: 10 anos")

    # ─── Server Certificate ──────────────────────────────────────────────
    server_key  = _generate_key()
    server_name = x509.Name(subject_attrs + [x509.NameAttribute(NameOID.COMMON_NAME, "localhost")])
    server_cert = (
        x509.CertificateBuilder()
        .subject_name(server_name)
        .issuer_name(ca_cert.subject)
        .public_key(server_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(datetime.utcnow())
        .not_valid_after(datetime.utcnow() + timedelta(days=info["server_cert_years"] * 365))
        .add_extension(x509.SubjectAlternativeName(san_list), critical=False)
        .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
        .sign(ca_key, hashes.SHA256())
    )
    _save_key(server_key, CERTS_DIR / "server.key")
    _save_cert(server_cert, CERTS_DIR / "server.crt")
    san_display = ", ".join(str(s.value) for s in san_list)
    ok(f"Server cert gerado com SANs: {san_display} — validade: {info['server_cert_years']} anos")

    # ─── Agent Base Certificate (para distribuição) ──────────────────────
    agent_key  = _generate_key()
    agent_name = x509.Name(subject_attrs + [x509.NameAttribute(NameOID.COMMON_NAME, "Doc-IT Agent")])
    agent_cert = (
        x509.CertificateBuilder()
        .subject_name(agent_name)
        .issuer_name(ca_cert.subject)
        .public_key(agent_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(datetime.utcnow())
        .not_valid_after(datetime.utcnow() + timedelta(days=info["agent_cert_years"] * 365))
        .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
        .add_extension(x509.ExtendedKeyUsage([x509.oid.ExtendedKeyUsageOID.CLIENT_AUTH]), critical=False)
        .sign(ca_key, hashes.SHA256())
    )
    _save_key(agent_key, CERTS_DIR / "agent.key")
    _save_cert(agent_cert, CERTS_DIR / "agent.crt")
    ok(f"Agent cert gerado — validade: {info['agent_cert_years']} anos")

    # ─── Copiar certs para o diretório do agente ─────────────────────────
    client_certs_dir = CLIENT_DIR / "certs"
    client_certs_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(CERTS_DIR / "ca.crt", client_certs_dir / "ca.crt")
    shutil.copy2(CERTS_DIR / "agent.crt", client_certs_dir / "agent.crt")
    shutil.copy2(CERTS_DIR / "agent.key", client_certs_dir / "agent.key")
    ok(f"Certs copiados para {client_certs_dir}")


# ─── STEP 7: Gerar config.json do agente ────────────────────────────────────
def generate_agent_config(info):
    step(8, "Gerando client/config.json...")

    # Determina a URL base com o primeiro IP/hostname informado
    first_entry = info["ips_hostnames"].split(",")[0].strip()
    server_url = f"https://{first_entry}:{info['port']}"

    config = {
        "server_base_url": server_url,
        "agent_id": None,
        "last_successful_checkin": None,
        "log_level": "INFO",
        "cert_path": "./certs/agent.crt",
        "key_path": "./certs/agent.key",
        "ca_path": "./certs/ca.crt"
    }

    config_path = CLIENT_DIR / "config.json"
    config_path.write_text(json.dumps(config, indent=4, ensure_ascii=False), encoding="utf-8")
    ok(f"config.json salvo em {config_path}")


# ─── STEP 8: Docker + Banco ─────────────────────────────────────────────────
def setup_database(info):
    step(9, "Iniciando PostgreSQL via Docker...")

    # Atualiza o docker-compose.yml com as credenciais informadas
    compose_path = BACKEND_DIR / "docker-compose.yml"
    compose_content = f"""services:
  postgres:
    image: postgres:15
    restart: always
    environment:
      POSTGRES_USER: {info['db_user']}
      POSTGRES_PASSWORD: {info['db_pass']}
      POSTGRES_DB: {info['db_name']}
    ports:
      - "{info['db_port']}:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
"""
    compose_path.write_text(compose_content, encoding="utf-8")
    ok("docker-compose.yml atualizado com as credenciais.")

    subprocess.check_call(["docker", "compose", "up", "-d"], cwd=str(BACKEND_DIR))
    ok("Container PostgreSQL iniciado.")

    # Aguarda PostgreSQL estar pronto
    print("  Aguardando PostgreSQL aceitar conexões...", end="", flush=True)
    for i in range(30):
        try:
            result = subprocess.run(
                ["docker", "compose", "exec", "-T", "postgres", "pg_isready", "-U", info["db_user"]],
                cwd=str(BACKEND_DIR), capture_output=True, text=True, timeout=5
            )
            if result.returncode == 0:
                print(f" {C.GREEN}pronto!{C.END}")
                break
        except Exception:
            pass
        time.sleep(1)
        print(".", end="", flush=True)
    else:
        warn("Timeout ao esperar PostgreSQL. Verifique o Docker.")


# ─── STEP 9: Prisma migrate + seed ──────────────────────────────────────────
def run_migrations():
    step(10, "Executando migrações do Prisma...")
    subprocess.check_call(
        ["npx", "prisma", "migrate", "deploy"],
        cwd=str(BACKEND_DIR), shell=True
    )
    ok("Migrações aplicadas.")

    step("10b", "Executando seed de grupos padrão...")
    seed_path = BACKEND_DIR / "seed-groups.js"
    if seed_path.exists():
        subprocess.check_call(["node", str(seed_path)], cwd=str(BACKEND_DIR))
        ok("Seed de grupos concluído.")
    else:
        warn(f"Seed não encontrado em {seed_path}. Pule esta etapa.")


# ─── STEP 10: Criar pasta de updates ────────────────────────────────────────
def ensure_updates_dir():
    UPDATES_DIR.mkdir(parents=True, exist_ok=True)


# ─── MAIN ────────────────────────────────────────────────────────────────────
def main():
    banner()

    # Verificar se já foi configurado
    env_path = BACKEND_DIR / ".env"
    certs_present = (CERTS_DIR / "ca.crt").exists() and (CERTS_DIR / "server.crt").exists()
    if env_path.exists() and certs_present:
        print(f"{C.YELLOW}⚠  Parece que o Doc-IT já foi configurado anteriormente.{C.END}")
        resp = input("  Deseja RECONFIGURAR? Isso vai sobrescrever .env e certs. (s/N): ").strip().lower()
        if resp != 's':
            print("Abortado pelo usuário.")
            sys.exit(0)
        print()

    check_system_deps()
    info = collect_info()

    install_npm_deps()
    generate_env(info)
    generate_pki(info)
    generate_agent_config(info)
    setup_database(info)
    run_migrations()
    ensure_updates_dir()

    # ─── Resumo final ────────────────────────────────────────────────────
    first_entry = info["ips_hostnames"].split(",")[0].strip()
    print(f"""
{C.GREEN}{C.BOLD}╔══════════════════════════════════════════╗
║        ✓  Setup concluído com sucesso!   ║
╚══════════════════════════════════════════╝{C.END}

{C.BOLD}Próximos passos:{C.END}
  1. Inicie o sistema:      {C.BLUE}start.bat{C.END}
  2. Acesse o painel:       {C.BLUE}https://{first_entry}:{info['port']}{C.END}
  3. Deploy do agente:      copie {C.BLUE}client/{C.END} para as máquinas-alvo

{C.BOLD}Arquivos gerados:{C.END}
  • backend/.env              (credenciais e JWT)
  • backend/certs/             (CA, server, agent)
  • client/config.json         (URL do servidor)
  • client/certs/              (certs do agente)
  • backend/docker-compose.yml (atualizado)
""")


if __name__ == "__main__":
    main()
