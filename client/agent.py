import platform
import socket
import uuid
import re
import psutil
import json
import winreg # Módulo específico para o Registro do Windows
import subprocess # Para obter UUID de hardware
import os # Para os.getlogin(), os.path.exists()
import sys # Importado para Auto-Updater sys.executable
import getpass # Para getpass.getuser()
import requests # Para HTTP requests
import urllib3
from datetime import datetime

# Suprime os avisos de conexões HTTPS não verificadas (comuns no localhost ou servidores de teste sem certificado válido)
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

#futuro: uptime
#futuro: drivers
#futuro: portas USB
#futuro: usuarios locais / ativos / logados
#futuro: workgroup
#futuro: ultima atualização / envio

# --- Configuration ---
CONFIG_FILE = "config.json"
LOG_FILE = "agent.log"
INVENTORY_FILE = "inventario.txt"
AGENT_VERSION = "1.2.23" # Versão do Agente

# --- Configuração Padrão ---
DEFAULT_CONFIG = {
    "server_base_url": "https://localhost:3000", # URL base do servidor (HTTPS)
    "agent_id": None,
    "last_successful_checkin": None,
    "log_level": "INFO", # Níveis: DEBUG, INFO, WARNING, ERROR, CRITICAL
    "cert_path": "./certs/agent.crt",
    "key_path": "./certs/agent.key",
    "ca_path": "./certs/ca.crt"
}

# --- Lógica de Nível de Log (Setup para a função de log) ---
LOG_LEVELS = {
    "DEBUG": 10,
    "INFO": 20,
    "WARNING": 30,
    "ERROR": 40,
    "CRITICAL": 50
}
# A configuração global será carregada no início da execução principal.
config = {}

# --- Logging ---
def log_event(message, level="INFO"):
    """
    Adiciona uma mensagem de log ao arquivo de log, respeitando o log_level da configuração.
    """
    global config # Usa a config global que será carregada no início

    # Obtém o nível de log configurado do objeto 'config'. Usa 'INFO' como padrão.
    configured_level_str = config.get("log_level", "INFO").upper()
    configured_level_num = LOG_LEVELS.get(configured_level_str, 20) # 20 é o valor para INFO

    # Obtém o nível numérico da mensagem atual.
    message_level_num = LOG_LEVELS.get(level.upper(), 20)

    # CONDIÇÃO: Apenas escreve no log se o nível da mensagem for igual ou mais importante
    # do que o nível configurado no config.json.
    if message_level_num >= configured_level_num:
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        log_entry = f"{timestamp} [{level.upper()}] - {message}\n"
        try:
            with open(LOG_FILE, "a", encoding="utf-8") as f:
                f.write(log_entry)
        except Exception as e:
            # Erros críticos ao escrever no log ainda são impressos no console.
            print(f"Crítico: Falha ao escrever no arquivo de log {LOG_FILE}: {e}")

# --- Configuration Management ---
def load_config():
    """Carrega a configuração do agente de config.json, cria padrão se não encontrado."""
    log_event(f"iniciando load_config()", "DEBUG")
    if not os.path.exists(CONFIG_FILE):
        # A primeira chamada ao log_event pode usar o nível padrão se a config ainda não foi carregada.
        log_event(f"Arquivo de configuração {CONFIG_FILE} não encontrado. Criando config padrão.", "WARNING")
        save_config(DEFAULT_CONFIG)
        return DEFAULT_CONFIG
    try:
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            loaded_config = json.load(f)
            for key, value in DEFAULT_CONFIG.items():
                if key not in loaded_config:
                    loaded_config[key] = value
            return loaded_config
    except (json.JSONDecodeError, Exception) as e:
        log_event(f"Falha ao carregar config de {CONFIG_FILE}: {e}. Usando config padrão.", "ERROR")
        save_config(DEFAULT_CONFIG)
        return DEFAULT_CONFIG

def save_config(config_data):
    """Salva os dados de configuração em config.json."""
    log_event(f"iniciando save_config()", "DEBUG")
    try:
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(config_data, f, indent=4, ensure_ascii=False)
    except Exception as e:
        log_event(f"Falha ao salvar config em {CONFIG_FILE}: {e}", "ERROR")


# --- Funções de Coleta (sem alterações) ---
def get_installed_software():
    log_event(f"iniciando get_installed_software()", "DEBUG")
    software_list = []
    uninstall_paths = [
        r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
        r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"
    ]
    
    for path in uninstall_paths:
        try:
            key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, path)
            for i in range(0, winreg.QueryInfoKey(key)[0]):
                subkey_name = winreg.EnumKey(key, i)
                subkey_path = rf"{path}\{subkey_name}"
                try:
                    subkey = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, subkey_path)
                    display_name, _ = winreg.QueryValueEx(subkey, "DisplayName")
                    # Tenta obter a versão, mas não falha se não existir
                    try:
                        display_version, _ = winreg.QueryValueEx(subkey, "DisplayVersion")
                    except OSError:
                        display_version = "N/A"
                    
                    if display_name.strip(): # Garante que display_name não seja apenas espaços em branco
                        software_list.append({"name": display_name, "version": display_version})
                    winreg.CloseKey(subkey)
                except OSError:
                    # Ignora chaves que não têm DisplayName (ex: atualizações do Windows)
                    pass
                except Exception: # Captura outros erros inesperados para uma subchave
                    pass
            winreg.CloseKey(key)
        except FileNotFoundError:
            # Ignora se o caminho do Registro não for encontrado
            pass
        except Exception: # Captura outros erros inesperados para um caminho
            pass

    # Remove duplicatas de forma mais robusta
    unique_software = []
    seen_software = set()
    for item in software_list:
        # Cria um frozenset de itens para torná-lo hashable para o set
        identifier = frozenset(item.items())
        if identifier not in seen_software:
            unique_software.append(item)
            seen_software.add(identifier)
            
    return sorted(unique_software, key=lambda x: x['name'].lower())

def get_windows_hardware_uuid():
    """
    Obtém o UUID de hardware da máquina Windows usando um comando WMI.
    Este é um identificador mais estável do que um UUID gerado aleatoriamente.
    """
    log_event(f"iniciando get_windows_hardware_uuid()", "DEBUG")
    try:
        # Comando para obter o UUID da placa-mãe via WMI
        result = subprocess.check_output("wmic csproduct get uuid", shell=True, text=True, stderr=subprocess.DEVNULL)
        # O output vem com o cabeçalho "UUID" e linhas em branco.
        # Precisamos limpar isso para pegar apenas o valor.
        hardware_uuid = result.strip().split("\n")[-1].strip()
        if hardware_uuid and hardware_uuid != "FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF" and len(hardware_uuid) > 5: # Checagem básica
            log_event(f"UUID de Hardware obtido: {hardware_uuid}", "DEBUG")
            return hardware_uuid
    except Exception as e:
        log_event(f"Aviso: Não foi possível obter o UUID do hardware via WMI: {e}", "WARNING")
    
    # Fallback será tratado pela lógica que garante que agent_id seja salvo no config
    log_event("Falha no UUID do WMI, dependerá do config ou gerará novo se for a primeira execução.", "WARNING")
    return str(uuid.uuid4()) # Fallback se o config também falhar ou for primeira execução sem sucesso no WMI

def get_os_username():
    """Obtém o nome de usuário atual do SO."""
    log_event(f"iniciando get_os_username()", "DEBUG")
    try:
        return getpass.getuser()
    except Exception:
        try:
            return os.getlogin()
        except Exception as e:
            log_event(f"Não foi possível determinar o nome de usuário do SO: {e}", "WARNING")
            return "unknown_user"

def get_primary_ip_address():
    """Tenta obter um endereço IPv4 primário não loopback."""
    log_event(f"iniciando get_primary_ip_address()", "DEBUG")
    try:
        hostname = socket.gethostname()
        # Isso obtém um IP que pode alcançar um site externo, frequentemente o primário.
        # Não conecta de fato, apenas resolve.
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.1) # Evita longas esperas
        try:
            s.connect(('8.8.8.8', 1)) # DNS do Google, pode ser qualquer IP externo confiável
            ip = s.getsockname()[0]
        except Exception:
            # Fallback se a conexão externa falhar, tenta resolução de hostname local
            try:
                ip = socket.gethostbyname(hostname)
            except socket.gaierror:
                ip = "127.0.0.1" # Último recurso
        finally:
            s.close()
        
        # Se o IP ainda for loopback, tenta encontrar um melhor com psutil
        if ip.startswith("127."):
            interfaces = psutil.net_if_addrs()
            for if_name, snic_list in interfaces.items():
                if "loopback" in if_name.lower() or "lo" == if_name.lower():
                    continue
                for snic in snic_list:
                    if snic.family == socket.AF_INET and not snic.address.startswith("169.254."):
                        return snic.address # Retorna o primeiro IPv4 não APIPA
            return "127.0.0.1" # Se nada melhor for encontrado
        return ip
    except Exception as e:
        log_event(f"Não foi possível determinar o endereço IP primário: {e}", "WARNING")
        return "unknown_ip"

def get_os_info_string():
    """Gera uma string concisa de informações do SO."""
    log_event(f"iniciando get_os_info_string()", "DEBUG")
    return f"{platform.system()} {platform.release()} ({platform.version()})"

def get_windows_updates():
    """Verifica atualizações pendentes do Windows Update."""
    log_event("iniciando get_windows_updates()", "DEBUG")
    updates_data = {"summary": "N/A", "details": []}
    
    try:
        import pythoncom
        pythoncom.CoInitialize()
    except Exception:
        pass

    try:
        import win32com.client
        ua = win32com.client.Dispatch("Microsoft.Update.Session")
        update_searcher = ua.CreateUpdateSearcher()
        # Search for updates that are not installed and are software updates
        log_event("Buscando atualizações do Windows...", "DEBUG")
        search_result = update_searcher.Search("IsInstalled=0 and Type='Software'")
        
        updates_data["summary"] = f"{search_result.Updates.Count} atualizações pendentes."
        log_event(f"Encontradas {search_result.Updates.Count} atualizações pendentes.", "INFO")
        
        for i in range(search_result.Updates.Count):
            update = search_result.Updates.Item(i)
            updates_data["details"].append({
                "title": update.Title,
                #"description": update.Description, # Pode ser muito grande
                "is_mandatory": update.IsMandatory,
                # "download_size": str(update.MaxDownloadSize)
            })
            
    except ImportError:
        log_event("pywin32 não instalado ou erro na importação. Pulo check de updates.", "WARNING")
        updates_data["summary"] = "pywin32 não disponível"
    except Exception as e:
         log_event(f"Erro ao verificar atualizações do Windows: {e}", "ERROR")
         updates_data["summary"] = f"Erro na verificação"
         
    return updates_data

def get_security_info():
    """Coleta o status do Firewall do Windows e de serviços do antivírus Sophos Endpoint."""
    log_event("iniciando get_security_info()", "DEBUG")
    security_data = {
        "firewall": {},
        "antivirus": {
            "name": "Sophos Endpoint",
            "installed": False,
            "running_services": []
        }
    }
    
    # --- 1. Firewall Status ---
    try:
        # Comando netsh para checar os 3 perfis do Windows Firewall (Domain, Private, Public)
        log_event("Buscando status do Windows Firewall...", "DEBUG")
        result = subprocess.check_output("netsh advfirewall show allprofiles state", shell=True, text=True, stderr=subprocess.DEVNULL)
        
        current_profile = None
        for line in result.split('\n'):
            line = line.strip()
            if "Profile Settings:" in line:
                current_profile = line.split()[0].lower() # domain, private ou public
            elif "State" in line and current_profile:
                state = line.split()[-1].lower() # ON ou OFF
                security_data["firewall"][current_profile] = state
                current_profile = None
                
    except Exception as e:
        log_event(f"Erro ao verificar status do Firewall: {e}", "ERROR")
        security_data["firewall"]["error"] = "Não foi possível verificar"

    # --- 2. Antivírus Status (Sophos) ---
    try:
        log_event("Verificando se serviços do Sophos estão instalados e rodando...", "DEBUG")
        sophos_found = False
        sophos_services = []
        
        for service in psutil.win_service_iter():
            try:
                # O nome do serviço do Sophos costuma conter "Sophos"
                serv_name = service.name()
                serv_display = service.display_name()
                
                if "sophos" in serv_name.lower() or "sophos" in serv_display.lower():
                    sophos_found = True
                    is_running = service.status() == psutil.STATUS_RUNNING
                    sophos_services.append({
                        "name": serv_display,
                        "status": "Running" if is_running else "Stopped"
                    })
            except psutil.AccessDenied:
                 # Pass if we don't have permission to view a specific service
                pass
            except Exception:
                pass
                
        security_data["antivirus"]["installed"] = sophos_found
        security_data["antivirus"]["running_services"] = sophos_services
        
    except Exception as e:
        log_event(f"Erro ao verificar serviços do Sophos: {e}", "ERROR")
        security_data["antivirus"]["error"] = "Não foi possível verificar serviços"
        
    return security_data

def get_cpu_model_clean():
    """Tenta obter o nome comercial limpo do processador, acionando o WMIC ou o Registro no Windows."""
    try:
        cpu_model_raw = platform.processor()
        if platform.system() == "Windows":
            # Windows 11 deprecates WMIC, checking Registry directly is safer and faster
            import winreg
            try:
                registry_key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"HARDWARE\DESCRIPTION\System\CentralProcessor\0")
                cpu_model_raw, _ = winreg.QueryValueEx(registry_key, "ProcessorNameString")
                winreg.CloseKey(registry_key)
            except Exception:
                # Fallback to WMIC if registry read fails for permissions
                try:
                    import subprocess
                    output = subprocess.check_output("wmic cpu get name", shell=True, text=True, stderr=subprocess.DEVNULL)
                    lines = output.strip().split('\n')
                    if len(lines) > 1:
                        cpu_model_raw = lines[-1].strip()
                except Exception:
                    pass
                
        cpu_model_clean = re.sub(r'\((TM|tm|R|r)\)', '', cpu_model_raw).strip()
        cpu_model_clean = re.sub(r' +', ' ', cpu_model_clean)
        return cpu_model_clean
    except Exception:
        return platform.processor()

def get_local_users_info():
    users_data = {
        "local_accounts": [],
        "active_sessions": []
    }
    try:
        if platform.system() == "Windows":
            import subprocess
            # Get purely local user accounts
            output = subprocess.check_output(
                ["powershell", "-NoProfile", "-Command", "Get-LocalUser | Select-Object Name, Enabled | ConvertTo-Json -Compress"],
                text=True, stderr=subprocess.DEVNULL
            )
            if output.strip():
                try:
                    import json
                    parsed_users = json.loads(output.strip())
                    if isinstance(parsed_users, dict): # Single user case
                        parsed_users = [parsed_users]
                    for u in parsed_users:
                        users_data["local_accounts"].append({
                            "name": u.get("Name", "Desconhecido"),
                            "enabled": u.get("Enabled", False)
                        })
                except json.JSONDecodeError:
                    pass
                    
        # Get active logged-in sessions using psutil
        for user in psutil.users():
            users_data["active_sessions"].append({
                "username": user.name,
                "terminal": user.terminal or "Desconhecido",
                "started": datetime.fromtimestamp(user.started).strftime('%Y-%m-%d %H:%M:%S')
            })
            
    except Exception as e:
        log_event(f"Erro ao coletar usuários: {e}", "ERROR")
        
    return users_data


def get_ad_gpo_info():
    ad_data = {
        "domain_or_workgroup": "Desconhecido",
        "is_domain_joined": False,
        "applied_gpos": []
    }
    
    try:
        import pythoncom
        pythoncom.CoInitialize()
    except Exception:
        pass

    try:
        import wmi
        c = wmi.WMI()
        for sys in c.Win32_ComputerSystem():
            ad_data["domain_or_workgroup"] = sys.Domain
            ad_data["is_domain_joined"] = sys.PartOfDomain
            
        if ad_data["is_domain_joined"] and platform.system() == "Windows":
            import subprocess
            # Acelera o gpresult lendo apenas o escopo do Computador. 
            # Pode exigir privilégios em alguns cenários, mas o agente roda como Admin.
            output = subprocess.check_output(
                ["gpresult", "/Scope", "Computer", "/v"],
                text=True, stderr=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW
            )
            # Simple parsing to get Applied GPOs names
            in_applied_section = False
            for line in output.split("\n"):
                clean_line = line.strip()
                # Suporte a Windows em Inglês e Português (com caracteres mal codificados tipo pol¡tica)
                if "Applied Group Policy Objects" in clean_line or ("Objetos de pol" in clean_line and "grupo aplicados" in clean_line):
                    in_applied_section = True
                    continue
                if in_applied_section and clean_line == "-" * len(clean_line) and len(clean_line) > 5:
                    continue
                if in_applied_section and clean_line == "":
                    # Fim da lista de GPOs nessa seção
                    in_applied_section = False
                    continue
                if in_applied_section and clean_line and "N/A" not in clean_line and "N/D" not in clean_line:
                    if clean_line not in ad_data["applied_gpos"]:
                        ad_data["applied_gpos"].append(clean_line)
                        
    except Exception as e:
        log_event(f"Erro ao coletar AD/GPO info: {e}", "ERROR")
        
    return ad_data

def get_additional_inventory_data():
    """
    Coleta dados de inventário detalhados para serem incluídos no campo additionalData do check-in.
    """
    log_event(f"iniciando get_additional_inventory_data()", "DEBUG")
    data = {}
    data["cpu_model"] = get_cpu_model_clean()
    data["users"] = get_local_users_info()
    data["ad_gpo"] = get_ad_gpo_info()

    mem = psutil.virtual_memory()
    data["ram_total_gb"] = round(mem.total / (1024**3), 2)
    data["ram_available_gb"] = round(mem.available / (1024**3), 2)
    data["ram_used_gb"] = round((mem.total - mem.available) / (1024**3), 2)
    
    try:
        data["boot_time_timestamp"] = psutil.boot_time()
    except Exception:
        data["boot_time_timestamp"] = None

    disks_info = []
    try:
        partitions = psutil.disk_partitions(all=False)
        for p in partitions:
            if 'cdrom' in p.opts or p.fstype == '' or 'removable' in p.opts:
                continue
            try:
                usage = psutil.disk_usage(p.mountpoint)
                disks_info.append({
                    "drive_mountpoint": p.mountpoint,
                    "total_gb": round(usage.total / (1024**3), 2),
                    "used_gb": round(usage.used / (1024**3), 2),
                    "free_gb": round(usage.free / (1024**3), 2),
                    "filesystem_type": p.fstype
                })
            except (PermissionError, FileNotFoundError, OSError) as e:
                log_event(f"Pulando disco {p.device} em additional_inventory devido a erro: {e}", "DEBUG")
    except Exception as e:
        log_event(f"Erro ao coletar partições de disco para additional_inventory: {e}", "WARNING")
    data["disks"] = disks_info

    network_interfaces_info = []
    try:
        interface_addresses = psutil.net_if_addrs()
        interface_stats = psutil.net_if_stats()
        for interface_name, snic_list in interface_addresses.items():
            if interface_name in interface_stats and interface_stats[interface_name].isup and \
               not (interface_name.lower().startswith('lo') or "loopback" in interface_name.lower() or "virtual" in interface_name.lower()):
                current_interface_details = {"interface_name": interface_name, "ipv4_addresses": [], "ipv6_addresses": [], "mac_addresses": []}
                has_relevant_ip = False
                for snic in snic_list:
                    if snic.family == socket.AF_INET and not snic.address.startswith("169.254.") and not snic.address.startswith("127."):
                        current_interface_details["ipv4_addresses"].append({"ip_address": snic.address, "netmask": snic.netmask or "N/A"})
                        has_relevant_ip = True
                    elif snic.family == socket.AF_INET6 and not snic.address.lower().startswith("fe80:") and snic.address != "::1":
                        current_interface_details["ipv6_addresses"].append({"ip_address": snic.address, "netmask": snic.netmask or "N/A"})
                    elif snic.family == psutil.AF_LINK and snic.address and snic.address.lower() != "00:00:00:00:00:00":
                        current_interface_details["mac_addresses"].append(snic.address.upper())
                if has_relevant_ip or current_interface_details["ipv6_addresses"]:
                    current_interface_details["mac_addresses"] = list(set(current_interface_details["mac_addresses"])) or ["N/A"]
                    network_interfaces_info.append(current_interface_details)
    except Exception as e:
        log_event(f"Erro ao coletar informações da interface de rede para additional_inventory: {e}", "WARNING")
    data["network_interfaces"] = network_interfaces_info
    data["installed_software"] = get_installed_software()
    
    # Adicionar Windows Updates
    data["windows_updates"] = get_windows_updates()
    
    # Adicionar Informações de Segurança (Firewall e Antivírus)
    data["security"] = get_security_info()
    
    data["collection_timestamp"] = datetime.now().isoformat()
    return data

# --- PKI: Verificação e Renovação de Certificado do Agente ---
CERT_RENEWAL_THRESHOLD_DAYS = 30  # Renova se faltar menos de 30 dias

def check_and_renew_agent_cert(config):
    """
    Verifica o certificado do agente e:
    - Se faltam > 30 dias: sem ação
    - Se faltam < 30 dias (mas ainda válido): gera CSR e renova via mTLS
    - Se expirado: solicita cert de emergência (sem mTLS)
    """
    cert_path = config.get("cert_path", DEFAULT_CONFIG["cert_path"])
    key_path  = config.get("key_path", DEFAULT_CONFIG["key_path"])
    ca_path   = config.get("ca_path", DEFAULT_CONFIG["ca_path"])
    
    if not os.path.exists(cert_path):
        log_event(f"Certificado do agente não encontrado em {cert_path}. Pulando verificação.", "WARNING")
        return
    
    try:
        from cryptography import x509
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import rsa
        from cryptography.x509.oid import NameOID
        
        # Lê o certificado atual
        with open(cert_path, "rb") as f:
            cert = x509.load_pem_x509_certificate(f.read())
        
        # Calcula dias restantes (usa _utc para evitar DeprecationWarning)
        from datetime import timezone
        now = datetime.now(timezone.utc)
        try:
            expiry = cert.not_valid_after_utc
        except AttributeError:
            expiry = cert.not_valid_after.replace(tzinfo=timezone.utc)
        days_left = (expiry - now).days
        
        log_event(f"Certificado do agente expira em {days_left} dias ({expiry.strftime('%Y-%m-%d')})", "INFO")
        
        if days_left > CERT_RENEWAL_THRESHOLD_DAYS:
            # Cert OK, sem ação necessária
            return
        
        server_url = config.get("server_base_url", DEFAULT_CONFIG["server_base_url"])
        agent_id = config.get("agent_id")
        
        if days_left > 0:
            # ─── Cenário: Cert prestes a expirar (< 30 dias, mas ainda válido) ───
            log_event(f"Cert expira em {days_left} dias. Solicitando renovação via mTLS...", "WARNING")
            
            # 1. Gera nova keypair
            new_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
            
            # 2. Gera CSR usando os dados do cert atual
            csr = (
                x509.CertificateSigningRequestBuilder()
                .subject_name(cert.subject)
                .sign(new_key, hashes.SHA256())
            )
            csr_pem = csr.public_bytes(serialization.Encoding.PEM).decode("utf-8")
            
            # 3. Envia para o backend via mTLS (cert atual ainda funciona)
            renew_url = f"{server_url}/agent/renew-cert"
            try:
                response = requests.post(
                    renew_url,
                    json={"agentId": agent_id, "csr": csr_pem},
                    cert=(cert_path, key_path),
                    verify=ca_path,
                    timeout=30
                )
                
                if response.status_code == 200:
                    new_cert_pem = response.json().get("cert")
                    if new_cert_pem:
                        # Salva novo cert e nova key
                        with open(cert_path, "w", encoding="utf-8") as f:
                            f.write(new_cert_pem)
                        with open(key_path, "wb") as f:
                            f.write(new_key.private_bytes(
                                serialization.Encoding.PEM,
                                serialization.PrivateFormat.TraditionalOpenSSL,
                                serialization.NoEncryption()
                            ))
                        log_event("Certificado do agente renovado com sucesso!", "INFO")
                    else:
                        log_event("Resposta do servidor sem cert. Renovação falhou.", "ERROR")
                else:
                    log_event(f"Renovação falhou. HTTP {response.status_code}: {response.text}", "ERROR")
            except Exception as e:
                log_event(f"Erro ao solicitar renovação de cert: {e}", "ERROR")
        
        else:
            # ─── Cenário: Cert já expirou ────────────────────────────────────
            log_event(f"ALERTA: Certificado EXPIRADO há {abs(days_left)} dias!", "CRITICAL")
            log_event("Solicitando cert de emergência (sem mTLS)...", "WARNING")
            
            emergency_url = f"{server_url}/agent/emergency-cert"
            try:
                response = requests.post(
                    emergency_url,
                    json={"agentId": agent_id},
                    verify=False,  # Sem mTLS (cert inválido)
                    timeout=15
                )
                if response.status_code == 200:
                    log_event("Solicitação de emergência registrada. Aguardando aprovação do administrador no painel.", "WARNING")
                else:
                    log_event(f"Solicitação de emergência falhou. HTTP {response.status_code}: {response.text}", "ERROR")
            except Exception as e:
                log_event(f"Erro ao solicitar cert de emergência: {e}", "ERROR")
    
    except ImportError:
        log_event("Lib 'cryptography' não disponível. Pulando verificação de cert.", "WARNING")
    except Exception as e:
        log_event(f"Erro inesperado na verificação de cert: {e}", "ERROR")

# --- Backend Communication ---
def perform_check_in(config):
    """Envia dados básicos do agente para o endpoint de check-in do backend com mTLS."""
    log_event(f"iniciando perform_check_in()", "DEBUG")
    check_in_url = f"{config.get('server_base_url', DEFAULT_CONFIG['server_base_url'])}/agent/check-in"
    
    payload = {
        "agentId": config.get("agent_id"),
        "hostname": socket.gethostname(),
        "osUsername": get_os_username(),
        "ipAddress": get_primary_ip_address(),
        "agentVersion": AGENT_VERSION,
        "osInfo": get_os_info_string(),
        "additionalData": get_additional_inventory_data()
    }

    if not payload["agentId"]:
        log_event("ID do Agente ausente. Não é possível realizar o check-in.", "ERROR")
        return False

    log_event(f"Tentando check-in para {check_in_url}", "INFO")
    
    # Preparar caminhos dos certificados
    cert_path = config.get("cert_path", DEFAULT_CONFIG["cert_path"])
    key_path = config.get("key_path", DEFAULT_CONFIG["key_path"])
    ca_path = config.get("ca_path", DEFAULT_CONFIG["ca_path"])

    # Verificar se certificados existem
    log_event("Verificando se os certificados existem no host...", "INFO")
    missing_certs = []
    if not os.path.exists(cert_path): missing_certs.append(f"Cert: {cert_path}")
    if not os.path.exists(key_path): missing_certs.append(f"Key: {key_path}")
    if not os.path.exists(ca_path): missing_certs.append(f"CA: {ca_path}")

    if missing_certs:
        log_event(f"Certificados faltando: {', '.join(missing_certs)}", "ERROR")
        return False
    else:
        log_event("Todos os certificados (Cert, Key e CA) encontrados e parecem OK no host local.", "INFO")

    try:
        # Check-in usando mTLS
        log_event("Iniciando conexão e handshake TLS com o servidor...", "INFO")
        response = requests.post(
            check_in_url, 
            json=payload, 
            timeout=30, # Aumentado timeout pois check de updates pode demorar? Não, updates já coletados.
            cert=(cert_path, key_path),
            verify=ca_path
        )
        log_event("Handshake TLS e conexão concluídos com sucesso!", "INFO")
        response.raise_for_status() 
        
        response_data = response.json()
        log_event(f"Check-in bem-sucedido. Resposta do servidor: {response_data}", "INFO")
        
        config["last_successful_checkin"] = datetime.now().isoformat()
        save_config(config) 
        
        # --- Buscando as Configurações Globais (Poolings) ---
        settings_url = f"{config.get('server_base_url', DEFAULT_CONFIG['server_base_url'])}/settings/agent"
        settings_response = requests.get(
            settings_url,
            timeout=15,
            cert=(cert_path, key_path),
            verify=ca_path
        )
        settings_response.raise_for_status()
        global_settings = settings_response.json()
        log_event(f"Configuracoes Globais carregadas: {global_settings}", "INFO")
        
        return True, global_settings
    except requests.exceptions.SSLError as ssl_err:
        log_event(f"Erro SSL durante o check-in (Verifique certificados): {ssl_err}", "ERROR")
    except requests.exceptions.HTTPError as http_err:
        log_event(f"Erro HTTP durante o check-in: {http_err} - Resposta: {http_err.response.text if http_err.response else 'Sem texto de resposta'}", "ERROR")
    except requests.exceptions.ConnectionError as conn_err:
        log_event(f"Erro de conexão durante o check-in: {conn_err}", "ERROR")
    except requests.exceptions.Timeout as timeout_err:
        log_event(f"Timeout durante o check-in: {timeout_err}", "ERROR")
    except requests.exceptions.RequestException as req_err:
        log_event(f"Erro geral durante o check-in: {req_err}", "ERROR")
    except json.JSONDecodeError:
        log_event(f"Falha ao decodificar resposta JSON do servidor.", "ERROR")
    except Exception as general_err:
        log_event(f"Falha desconhecida no checkin ou configuracoes: {general_err}", "ERROR")
    
    return False, None

def get_system_inventory(agent_id):
    """
    Coleta todas as informações do sistema e as retorna em um dicionário.
    Inclui o agent_id.
    """
    log_event(f"iniciando get_system_inventory()", "DEBUG")
    inventory_data = {}

    # --- Informações de Sistema e Hardware ---
    inventory_data["agent_id"] = agent_id # Usa o agent_id persistente
    inventory_data["hostname"] = socket.gethostname()
    inventory_data["os_name_release"] = f"{platform.system()} {platform.release()}" # Renomeado para clareza
    inventory_data["os_version_full"] = platform.version() # Renomeado para clareza
    
    inventory_data["cpu_model"] = get_cpu_model_clean()

    
    mem = psutil.virtual_memory()
    inventory_data["ram_total_gb"] = round(mem.total / (1024**3), 2)
    inventory_data["ram_available_gb"] = round(mem.available / (1024**3), 2) # RAM disponível adicionada
    inventory_data["ram_used_gb"] = round((mem.total - mem.available) / (1024**3), 2) # RAM usada adicionada

    try:
        inventory_data["boot_time_timestamp"] = psutil.boot_time()
    except Exception:
        inventory_data["boot_time_timestamp"] = None

    disks_info = []
    try:
        partitions = psutil.disk_partitions(all=False) # all=False para evitar erros de floppy/CD se não estiverem prontos
        for p in partitions:
            if 'cdrom' in p.opts or p.fstype == '' or 'removable' in p.opts: # Filtro mais robusto
                continue
            try:
                usage = psutil.disk_usage(p.mountpoint)
                disk_info_item = {
                    "drive_mountpoint": p.mountpoint,
                    "total_gb": round(usage.total / (1024**3), 2),
                    "used_gb": round(usage.used / (1024**3), 2), # Espaço usado adicionado
                    "free_gb": round(usage.free / (1024**3), 2),
                    "filesystem_type": p.fstype
                }
                disks_info.append(disk_info_item)
            except (PermissionError, FileNotFoundError, OSError) as e: # Captura OSError para drives não prontos
                log_event(f"Pulando disco {p.device} devido a erro: {e}", "DEBUG")
                continue
    except Exception as e:
        log_event(f"Erro ao coletar partições de disco: {e}", "WARNING")
    inventory_data["disks"] = disks_info

    # --- Informações de Rede Detalhadas por Interface Ativa ---
    network_interfaces_info = []
    try:
        interface_addresses = psutil.net_if_addrs()
        interface_stats = psutil.net_if_stats()

        for interface_name, snic_list in interface_addresses.items():
            if interface_name in interface_stats and interface_stats[interface_name].isup and \
               not (interface_name.lower().startswith('lo') or "loopback" in interface_name.lower() or "virtual" in interface_name.lower()):
                
                current_interface_details = {
                    "interface_name": interface_name,
                    "ipv4_addresses": [],
                    "ipv6_addresses": [], # IPv6 adicionado
                    "mac_addresses": []
                }
                
                has_relevant_ip = False

                for snic in snic_list:
                    if snic.family == socket.AF_INET:
                        if not snic.address.startswith("169.254.") and not snic.address.startswith("127."):
                            current_interface_details["ipv4_addresses"].append({
                                "ip_address": snic.address,
                                "netmask": snic.netmask if snic.netmask else "N/A",
                            })
                            has_relevant_ip = True
                    elif snic.family == socket.AF_INET6: # IPv6
                         # Filtra link-local (fe80::) e loopback (::1)
                        if not snic.address.lower().startswith("fe80:") and snic.address != "::1":
                            current_interface_details["ipv6_addresses"].append({
                                "ip_address": snic.address,
                                "netmask": snic.netmask if snic.netmask else "N/A", # Netmask para IPv6 é o comprimento do prefixo
                            })
                            # has_relevant_ip = True # Descomente se IPv6 sozinho for suficiente para listar a interface
                    elif snic.family == psutil.AF_LINK:
                        if snic.address and snic.address.lower() != "00:00:00:00:00:00":
                            current_interface_details["mac_addresses"].append(snic.address.upper())
                
                if has_relevant_ip or current_interface_details["ipv6_addresses"]: # Lista se tiver IPv4 relevante ou qualquer IPv6 não local
                    current_interface_details["mac_addresses"] = list(set(current_interface_details["mac_addresses"]))
                    if not current_interface_details["mac_addresses"]:
                        current_interface_details["mac_addresses"].append("N/A")
                    network_interfaces_info.append(current_interface_details)
    except Exception as e:
        log_event(f"Erro ao coletar informações da interface de rede: {e}", "WARNING")
    inventory_data["network_interfaces"] = network_interfaces_info

    # --- Informações de Software ---
    inventory_data["installed_software"] = get_installed_software()
    inventory_data["collection_timestamp"] = datetime.now().isoformat() # Timestamp para este inventário
    
    return inventory_data

def check_and_apply_updates(config):
    """
    Verifica atualizações no backend, faz o download verificando o hash SHA-256 e inicia o updater.
    """
    log_event("Checando por atualizaçoes do Agente (Auto-Updater)...", "INFO")
    
    version_url = f"{config.get('server_base_url', DEFAULT_CONFIG['server_base_url'])}/agent/version"
    cert_path = config.get("cert_path", DEFAULT_CONFIG["cert_path"])
    key_path = config.get("key_path", DEFAULT_CONFIG["key_path"])
    ca_path = config.get("ca_path", DEFAULT_CONFIG["ca_path"])

    try:
        if os.path.exists(cert_path) and os.path.exists(key_path) and os.path.exists(ca_path):
            response = requests.get(version_url, cert=(cert_path, key_path), verify=ca_path, timeout=10)
        else:
            response = requests.get(version_url, verify=False, timeout=10)
        
        if response.status_code == 200:
            version_data = response.json()
            latest_version = version_data.get('version')
            
            # Simple semantic version string comparison 
            if latest_version and latest_version != AGENT_VERSION:
                log_event(f"Nova versao {latest_version} detectada! Iniciando download seguro...", "INFO")
                
                # Setup urls
                base_update_url = f"{config.get('server_base_url', DEFAULT_CONFIG['server_base_url'])}/agent/update"
                import hashlib
                
                def download_and_verify(file_name, expected_hash, save_path):
                    log_event(f"Baixando {file_name}...", "INFO")
                    file_url = f"{base_update_url}/{file_name}"
                    
                    if os.path.exists(cert_path) and os.path.exists(key_path) and os.path.exists(ca_path):
                        r = requests.get(file_url, cert=(cert_path, key_path), verify=ca_path, stream=True, timeout=30)
                    else:
                        r = requests.get(file_url, verify=False, stream=True, timeout=30)
                        
                    if r.status_code != 200:
                        log_event(f"Falha no download HTTP de {file_name} Status: {r.status_code}", "ERROR")
                        return False
                        
                    sha256 = hashlib.sha256()
                    with open(save_path, 'wb') as f:
                        for chunk in r.iter_content(chunk_size=8192):
                            f.write(chunk)
                            sha256.update(chunk)
                    
                    calc_hash = sha256.hexdigest()
                    if calc_hash != expected_hash:
                        log_event(f"SECURITY ALERT: Hash SHA-256 incorreto para {file_name}. Esperado: {expected_hash}, Calculado: {calc_hash}", "CRITICAL")
                        os.remove(save_path)
                        return False
                    
                    log_event(f"Download e verificacao de Criptografia do {file_name} concluidos com sucesso.", "INFO")
                    return True
                
                # Define the correct names from backend or fallback to legacy names
                agent_filename = version_data.get('agentFileName', "agent.exe")
                updater_filename = version_data.get('updaterFileName', "updater.exe")

                # Baixa o agente novo e o updater.exe
                if download_and_verify(agent_filename, version_data.get('agentHash'), "agent_new.exe"):
                    if download_and_verify(updater_filename, version_data.get('updaterHash'), updater_filename):
                        log_event(f"Baixados todos os binarios da atualizacao com sucesso. Passando controle para o {updater_filename} de forma separada...", "INFO")
                        
                        try:
                            # Determina o nome correto do executável
                            # Se o exe atual é o genérico "agent.exe", usa o nome definido no servidor
                            current_executable = os.path.basename(sys.executable) if getattr(sys, 'frozen', False) else "agent.exe"
                            target_executable = agent_filename  # Nome definido pelo projeto (ex: Doc-IT-agent.exe)
                            subprocess.Popen([updater_filename, current_executable, "agent_new.exe", target_executable], creationflags=subprocess.CREATE_NEW_CONSOLE | subprocess.CREATE_NO_WINDOW)
                            os._exit(0)
                        except Exception as e:
                            log_event(f"Falha ao lancar o {updater_filename} subprocess: {e}", "CRITICAL")
                            
            else:
                log_event("O Agente ja esta na versao mais recente.", "INFO")
        else:
             log_event(f"Nao foi possivel verificar atualizacao. Backend retornou HTTP {response.status_code}", "WARNING")

    except requests.exceptions.RequestException as e:
        log_event(f"Erro de rede ao verificar updates: {e}", "ERROR")
    except Exception as e:
        log_event(f"Erro inesperado no Auto-Updater: {e}", "ERROR")

if __name__ == "__main__":
    # Carrega a configuração no início para que o log_level seja definido globalmente.
    config = load_config()

    log_event("Script do agente iniciado.", "INFO")
    log_event("AVISO ! VOCE ESTA EM DEBUG MODE, CUIDADO COM A PERFORMANCE.", "DEBUG")

    # Captura qualquer exceção não tratada e grava no log antes de sair
    def handle_unhandled_exception(exc_type, exc_value, exc_traceback):
        import traceback
        tb_str = ''.join(traceback.format_exception(exc_type, exc_value, exc_traceback))
        log_event(f"CRASH NAO TRATADO: {tb_str}", "CRITICAL")
    sys.excepthook = handle_unhandled_exception
    
    if not config.get("agent_id"):
        log_event("ID do Agente não encontrado no config. Tentando obter UUID de hardware.", "INFO")
        hw_uuid = get_windows_hardware_uuid() # Esta função agora tem seu próprio fallback
        if hw_uuid:
            config["agent_id"] = hw_uuid
            save_config(config)
            log_event(f"ID do Agente definido como: {hw_uuid} e salvo no config.", "INFO")
        else:
            # Este caso deve ser raro se get_windows_hardware_uuid sempre retornar algo
            log_event("Falha ao obter ou gerar um novo ID do Agente. Saindo.", "CRITICAL")
            exit(1) # Sai se nenhum ID puder ser estabelecido
    else:
        log_event(f"Usando ID do Agente do config: {config['agent_id']}", "INFO")

    # Verifica e renova o certificado do agente antes de qualquer comunicação
    check_and_renew_agent_cert(config)

    import socketio
    import threading
    import os
    import time
    
    # Realiza o check-in e pega as configurações
    check_in_successful, global_settings = perform_check_in(config)
    
    # Valores fallback de segurança (Minutos)
    inventory_interval = 60
    update_interval = 120
    
    if check_in_successful:
        log_event("Processo de check-in inicial concluído com sucesso.", "INFO")
        if global_settings:
            inventory_interval = global_settings.get("inventoryIntervalMinutes", 60)
            update_interval = global_settings.get("updateCheckIntervalMinutes", 120)
    else:
        log_event("Processo de check-in falhou. Usando intervalos padrão.", "WARNING")

    # --- Thread 1: Auto-Updater Loop ---
    def auto_updater_loop():
        log_event(f"Iniciando thread de Auto-Update (Checagem a cada {update_interval} minutos).", "INFO")
        
        # IMPORTANTE: Inicializa a COM library para essa Thread, necessário para chamadas WMI/Windows Update em background
        try:
            import pythoncom
            pythoncom.CoInitialize()
        except Exception as e:
            log_event(f"Aviso: Não foi possível inicializar COM para a thread de Update: {e}", "WARNING")
            
        while True:
            try:
                check_and_apply_updates(config)
            except Exception as e:
                log_event(f"Erro no loop de Auto-Update: {e}", "ERROR")
            
            # Dorme pelo intervalo (convertido pra segundos)
            time.sleep(update_interval * 60)
            
    threading.Thread(target=auto_updater_loop, daemon=True).start()

    # --- Thread 2: Inventory Collector Loop ---
    def inventory_collector_loop():
        log_event(f"Iniciando thread de Inventário (Coleta a cada {inventory_interval} minutos).", "INFO")
        
        # IMPORTANTE: Inicializa a COM library para essa Thread, necessário para chamadas WMI/Windows Update em background
        try:
            import pythoncom
            pythoncom.CoInitialize()
        except Exception as e:
            log_event(f"Aviso: Não foi possível inicializar COM para a thread de Inventário: {e}", "WARNING")

        while True:
            try:
                log_event("Coletando inventário completo do sistema para salvamento local...", "INFO")
                full_inventory = get_system_inventory(config["agent_id"]) 
                
                with open(INVENTORY_FILE, "w", encoding="utf-8") as f:
                    json.dump(full_inventory, f, indent=4, ensure_ascii=False)
                log_event(f"Inventário completo salvo localmente em: {INVENTORY_FILE}", "INFO")
                
                # Aproveita pra fazer Check-in de novo pra manter Online no painel
                perform_check_in(config) 
            except Exception as e:
                log_event(f"Erro no loop de Inventário: {e}", "ERROR")

            # Dorme pelo intervalo (convertido pra segundos)
            time.sleep(inventory_interval * 60)

    threading.Thread(target=inventory_collector_loop, daemon=True).start()
        
    log_event("Inicializando conexão WebSocket para o Terminal Remoto...", "INFO")

    # Desabilitando verificação SSL no socketio primariamente por causa do localhost self-signed CA no client. 
    sio = socketio.Client(ssl_verify=False)
    terminal_process = None
    cmd_buffer = ""

    @sio.event
    def connect():
        log_event("Conectado ao servidor WebSocket para o Terminal.", "INFO")

    @sio.event
    def disconnect():
        log_event("Desconectado do servidor WebSocket.", "WARNING")

    @sio.on('terminal:start')
    def on_terminal_start(data):
        log_event(f"Recebido pedido de iniciar terminal: {data}", "DEBUG")
        if data.get('agentId') != config['agent_id']:
            return
        
        global terminal_process
        global cmd_buffer
        if terminal_process is None or terminal_process.poll() is not None:
            log_event("Iniciando processo cmd.exe para o terminal...", "INFO")
            cmd_buffer = "" # Reseta o histórico a cada conexão
            terminal_process = subprocess.Popen(
                ["cmd.exe", "/Q"], # /Q Mode Quieto: O terminal nÆo ecoa os comandos, a gente ecoa no frontend React
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                bufsize=0
            )

            def read_stdout():
                log_event("Thread de leitura do terminal iniciada.", "DEBUG")
                while True:
                    if terminal_process is None or terminal_process.poll() is not None:
                        break
                    try:
                        output_bytes = os.read(terminal_process.stdout.fileno(), 1024)
                        if not output_bytes:
                            break
                        # A comunicação do cmd no Windows pt-BR costuma ser cp850
                        text = output_bytes.decode('cp850', errors='replace')
                        sio.emit('terminal:output', {'agentId': config['agent_id'], 'data': text})
                    except Exception as e:
                        log_event(f"Erro na thread de leitura do terminal: {e}", "ERROR")
                        break
                log_event("Thread de leitura do terminal encerrada.", "DEBUG")

            threading.Thread(target=read_stdout, daemon=True).start()

    @sio.on('terminal:data')
    def on_terminal_data(data):
        if data.get('agentId') != config['agent_id']:
            return
        global terminal_process
        if terminal_process and terminal_process.poll() is None:
            try:
                line_data = data.get('data', '')
                
                # O React agora envia a linha inteira ao apertar Enter
                if line_data.strip():
                    log_event(f"[Terminal] Comando Remoto Executado: {line_data.strip()}", "INFO")

                terminal_process.stdin.write(line_data.encode('cp850'))
                terminal_process.stdin.flush() # CRÍTICO: Força o envio dos bytes para o processo filho
            except Exception as e:
                log_event(f"Erro ao escrever no terminal: {e}", "ERROR")

    @sio.on('terminal:stop')
    def on_terminal_stop(data):
        if data.get('agentId') != config['agent_id']:
            return
        global terminal_process
        if terminal_process and terminal_process.poll() is None:
            terminal_process.terminate()
            terminal_process = None
            log_event("Processo de terminal encerrado pelo servidor.", "INFO")

    # --- Controle de Desktop Remoto ---
    desktop_streaming = False
    current_monitor_index = 1
    current_quality = 'medium'
    
    @sio.on('desktop:get_monitors')
    def on_desktop_get_monitors(data):
        if data.get('agentId') != config['agent_id']:
            return
        
        try:
            import mss
            with mss.mss() as sct:
                # sct.monitors[0] é o all in one, [1] é o primário, [2] o secundário, etc.
                monitors_info = []
                for i, monitor in enumerate(sct.monitors):
                    if i == 0:
                        monitors_info.append({"index": i, "name": "Todas as Telas", "width": monitor["width"], "height": monitor["height"]})
                    else:
                        monitors_info.append({"index": i, "name": f"Monitor {i}", "width": monitor["width"], "height": monitor["height"]})
                
                sio.emit('desktop:monitor_list', {
                    'agentId': config['agent_id'],
                    'monitors': monitors_info
                })
        except Exception as e:
            log_event(f"Erro ao listar monitores: {e}", "ERROR")

    def _run_osd_overlay(viewer_name):
        try:
            import tkinter as tk
            root = tk.Tk()
            root.overrideredirect(True)
            root.attributes("-alpha", 0.9)
            root.attributes("-topmost", True)
            
            # Fundo vermelho e texto branco
            root.config(bg='#d32f2f')
            
            label = tk.Label(root, text=f"Doc-IT: Sessão Remota Ativa por {viewer_name}", 
                             fg="white", bg="#d32f2f", font=("Segoe UI", 11, "bold"), padx=20, pady=5)
            label.pack()
            
            # Centralizar no topo da tela primária
            root.update_idletasks()
            screen_width = root.winfo_screenwidth()
            w = root.winfo_width()
            x = (screen_width // 2) - (w // 2)
            root.geometry(f"+{x}+0")
            
            # Loop de checagem para se auto-destruir quando a stream parar
            def check_status():
                global desktop_streaming
                if not desktop_streaming:
                    root.destroy()
                else:
                    root.after(1000, check_status)
                    
            root.after(1000, check_status)
            root.mainloop()
        except Exception as e:
            log_event(f"Erro ao instanciar OSD Tkinter: {e}", "ERROR")

    @sio.on('desktop:start')
    def on_desktop_start(data):
        if data.get('agentId') != config['agent_id']:
            return
        global desktop_streaming
        global current_monitor_index
        global current_quality
        
        requested_monitor = data.get('monitorIndex', 1) # Default monitor 1
        requested_quality = data.get('quality', 'medium')
        invisible_mode = data.get('invisible_mode', False)
        viewer_name = data.get('viewer', 'Administrador')
        
        # Se já estiver rodando e pedirem o MESMO monitor E a MESMA qualidade, ignora
        if desktop_streaming and current_monitor_index == requested_monitor and current_quality == requested_quality:
            return 
            
        # Se estiver rodando para OUTRO monitor ou OUTRA qualidade, para o atual
        if desktop_streaming:
            desktop_streaming = False
            time.sleep(0.5) # Dá um tempinho pra thread atual morrer
            
        log_event(f"Iniciando Streaming de Tela (Monitor {requested_monitor} | Quality {requested_quality} | Stealth: {invisible_mode}) via WebSocket...", "INFO")
        desktop_streaming = True
        current_monitor_index = requested_monitor
        current_quality = requested_quality
        
        if not invisible_mode:
            threading.Thread(target=_run_osd_overlay, args=(viewer_name,), daemon=True).start()
        
        
        def stream_screen(monitor_idx, quality_profile):
            import mss
            import base64
            # Compressao rapida para economizar banda
            try:
                from PIL import Image
                import io
            except ImportError:
                log_event("Biblioteca Pillow nao encontrada. Instalando ou abortando stream.", "ERROR")
                global desktop_streaming
                desktop_streaming = False
                return

            # Apply Quality Limits
            if quality_profile == 'low':
                max_w, max_h = 854, 480
                jpeg_quality = 30
                sleep_time = 0.1 # ~10 FPS
            elif quality_profile == 'high':
                max_w, max_h = 1920, 1080
                jpeg_quality = 60
                sleep_time = 0.05 # ~20 FPS
            elif quality_profile == 'ultra':
                max_w, max_h = 3840, 2160 # basically native cap bounds
                jpeg_quality = 80
                sleep_time = 0.033 # ~30 FPS
            else: # medium defaults
                max_w, max_h = 1280, 720
                jpeg_quality = 40
                sleep_time = 0.066 # ~15 FPS

            with mss.mss() as sct:
                # Garante que o indice existe, senao fallback pro 1
                if monitor_idx >= len(sct.monitors):
                    monitor_idx = 1
                    
                monitor = sct.monitors[monitor_idx]
                
                while desktop_streaming:
                    if not sio.connected:
                        break
                    
                    try:
                        # 1. Captura a imagem pura
                        sct_img = sct.grab(monitor)
                        
                        # 2. Converte pra Pillow Image pra poder dar resize/compress
                        img = Image.frombytes("RGB", sct_img.size, sct_img.bgra, "raw", "BGRX")
                        
                        # (Opcional) Dimensoes maximas para nao destruir a banda
                        if img.width > max_w or img.height > max_h:
                            img.thumbnail((max_w, max_h), Image.Resampling.LANCZOS)
                        
                        # 3. Comprime como JPEG
                        buffer = io.BytesIO()
                        img.save(buffer, format="JPEG", quality=jpeg_quality)
                        b64_img = base64.b64encode(buffer.getvalue()).decode('utf-8')
                        
                        # 4. Envia pro backend relay
                        sio.emit('desktop:frame', {
                            'agentId': config['agent_id'],
                            'imageB64': b64_img,
                            'width': img.width, 
                            'height': img.height
                        })
                        
                        time.sleep(sleep_time) # FPS Limiter baseado no profile de Qualidade
                    except Exception as e:
                         log_event(f"Erro no loop de streaming de desktop: {e}", "ERROR")
                         time.sleep(1) 

            log_event("Streaming de Tela encerrado do laco.", "INFO")
            if sio.connected:
                try:
                    sio.emit('desktop:stopped', {'agentId': config['agent_id']})
                except Exception:
                    pass
            
        threading.Thread(target=stream_screen, args=(current_monitor_index, current_quality), daemon=True).start()

    @sio.on('desktop:stop')
    def on_desktop_stop(data):
        if data.get('agentId') != config['agent_id']:
            return
        global desktop_streaming
        log_event("Parando Streaming de Tela a pedido do Frontend.", "INFO")
        desktop_streaming = False

    @sio.on('desktop:mouse_move')
    def on_desktop_mouse_move(data):
        if data.get('agentId') != config['agent_id'] or not desktop_streaming:
            return
        import pyautogui
        # Recebemos as proporções relativas do Canvas para mapear pro tamanho real da tela
        try:
            # Desativa o 'fail-safe' do pyautogui temporariamente se mover pros cantos der ruim
            pyautogui.FAILSAFE = False 
            screen_w, screen_h = pyautogui.size()
            
            # x_recebido e y_recebido em cima do "width/height" recebido do frame
            frame_x = data.get('x', 0)
            frame_y = data.get('y', 0)
            frame_w = data.get('width', screen_w)
            frame_h = data.get('height', screen_h)
            
            # Mapeamento do x e y pro tamanho real resolucao do Agente
            target_x = (frame_x / frame_w) * screen_w
            target_y = (frame_y / frame_h) * screen_h
            
            pyautogui.moveTo(target_x, target_y)
        except Exception as e:
            pass

    @sio.on('desktop:mouse_click')
    def on_desktop_mouse_click(data):
        if data.get('agentId') != config['agent_id'] or not desktop_streaming:
            return
        import pyautogui
        try:
            button = data.get('button', 'left') # left, right, middle
            
            screen_w, screen_h = pyautogui.size()
            frame_x = data.get('x', 0)
            frame_y = data.get('y', 0)
            frame_w = data.get('width', screen_w)
            frame_h = data.get('height', screen_h)
            
            target_x = (frame_x / frame_w) * screen_w
            target_y = (frame_y / frame_h) * screen_h
            pyautogui.click(x=target_x, y=target_y, button=button)
        except Exception:
            pass
            
    @sio.on('desktop:key_down')
    def on_desktop_key_down(data):
        if data.get('agentId') != config['agent_id'] or not desktop_streaming:
            return
        import pyautogui
        try:
            key = data.get('key', '')
            # Mapeia teclas especiais do JS pro PyAutoGUI ("ArrowDown" -> "down", "Enter" -> "enter")
            key_map = {
               'ArrowDown': 'down', 'ArrowUp': 'up', 'ArrowLeft': 'left', 'ArrowRight': 'right',
               'Enter': 'enter', 'Escape': 'esc', 'Backspace': 'backspace', 'Tab': 'tab',
               'Delete':'delete', ' ': 'space'
            }
            py_key = key_map.get(key, key.lower())
            pyautogui.press(py_key)
        except Exception:
            pass


    socket_url = config.get('server_base_url', DEFAULT_CONFIG['server_base_url'])
    agent_id = config.get('agent_id', 'unknown')
    
    WEBSOCKET_RETRY_INTERVAL = 60  # segundos entre tentativas
    
    while True:
        try:
            log_event(f"Conectando ao WebSocket na URL: {socket_url}", "INFO")
            sio.connect(
                socket_url,
                headers={'x-agent-id': agent_id}  # Identifica o agente para o middleware de auth do servidor
            )
            # Mantém o script python vivo escutando os eventos
            sio.wait()
            # Se sio.wait() retornar (desconexão limpa), aguarda e tenta reconectar
            log_event(f"WebSocket desconectado. Tentando reconectar em {WEBSOCKET_RETRY_INTERVAL}s...", "WARNING")
        except Exception as e:
            log_event(f"Erro ao conectar ao WebSocket: {e}. Tentando novamente em {WEBSOCKET_RETRY_INTERVAL}s...", "ERROR")
        
        # Garante que o socket está desconectado antes de tentar novamente
        try:
            sio.disconnect()
        except Exception:
            pass
        
        time.sleep(WEBSOCKET_RETRY_INTERVAL)

    log_event("Script do agente finalizado.", "INFO")
