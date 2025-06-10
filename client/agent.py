import platform
import socket
import uuid
import re
import psutil
import json
import winreg # Módulo específico para o Registro do Windows
import subprocess # Para obter UUID de hardware
import os # Para os.getlogin(), os.path.exists()
import getpass # Para getpass.getuser()
import requests # Para HTTP requests
from datetime import datetime

#futuro: uptime
#futuro: drivers
#futuro: status do firewall
#futuro: portas USB
#futuro: usuarios locais / ativos / logados
#futuro: workgroup
#futuro: ultima atualização / envio

# --- Configuration ---
CONFIG_FILE = "config.json"
LOG_FILE = "agent.log"
INVENTORY_FILE = "inventario.txt"
AGENT_VERSION = "1.1.0" # Versão do Agente

# --- Configuração Padrão ---
DEFAULT_CONFIG = {
    "server_base_url": "http://localhost:3000", # URL base do servidor
    "agent_id": None,
    "last_successful_checkin": None,
    "log_level": "INFO" # Níveis: DEBUG, INFO, WARNING, ERROR, CRITICAL
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

def get_additional_inventory_data():
    """
    Coleta dados de inventário detalhados para serem incluídos no campo additionalData do check-in.
    """
    log_event(f"iniciando get_additional_inventory_data()", "DEBUG")
    data = {}
    try:
        cpu_model_raw = platform.processor()
        cpu_model_clean = re.sub(r'\((TM|tm|R|r)\)', '', cpu_model_raw).strip()
        cpu_model_clean = re.sub(r' +', ' ', cpu_model_clean)
        data["cpu_model"] = cpu_model_clean
    except Exception:
        data["cpu_model"] = platform.processor()

    mem = psutil.virtual_memory()
    data["ram_total_gb"] = round(mem.total / (1024**3), 2)
    data["ram_available_gb"] = round(mem.available / (1024**3), 2)

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
    data["collection_timestamp"] = datetime.now().isoformat()
    return data

# --- Backend Communication ---
def perform_check_in(config):
    """Envia dados básicos do agente para o endpoint de check-in do backend."""
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

    # log_event(f"Tentando check-in para {check_in_url} com payload: {json.dumps(payload)}", "INFO")
    log_event(f"Tentando check-in para {check_in_url}", "INFO")
    log_event(f"payload: {json.dumps(payload)}", "DEBUG")
    try:
        response = requests.post(check_in_url, json=payload, timeout=10) # Timeout de 10 segundos
        response.raise_for_status() # Levanta HTTPError para respostas ruins (4XX ou 5XX)
        
        response_data = response.json()
        log_event(f"Check-in bem-sucedido. Resposta do servidor: {response_data}", "INFO")
        
        config["last_successful_checkin"] = datetime.now().isoformat()
        save_config(config) # Salva o horário do último check-in atualizado
        
        return True
    except requests.exceptions.HTTPError as http_err:
        log_event(f"Erro HTTP durante o check-in: {http_err} - Resposta: {http_err.response.text if http_err.response else 'Sem texto de resposta'}", "ERROR")
    except requests.exceptions.ConnectionError as conn_err:
        log_event(f"Erro de conexão durante o check-in: {conn_err}", "ERROR")
    except requests.exceptions.Timeout as timeout_err:
        log_event(f"Timeout durante o check-in: {timeout_err}", "ERROR")
    except requests.exceptions.RequestException as req_err:
        log_event(f"Erro geral durante o check-in: {req_err}", "ERROR")
    except json.JSONDecodeError:
        log_event(f"Falha ao decodificar resposta JSON do servidor. Resposta crua: {response.text if 'response' in locals() else 'Sem objeto de resposta'}", "ERROR")
    
    return False

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
    
    # Tenta obter um nome de processador mais limpo
    try:
        # No Windows, platform.processor() pode já ser bom.
        # Em outros sistemas, ou para mais detalhes, cpuinfo poderia ser usado, mas para simplificar:
        cpu_model = platform.processor()
        # Tenta limpar strings comuns de informações extras em alguns sistemas
        cpu_model = re.sub(r'\((TM|tm|R|r)\)', '', cpu_model).strip()
        cpu_model = re.sub(r' +', ' ', cpu_model) # Remove espaços múltiplos
        inventory_data["cpu_model"] = cpu_model
    except Exception:
        inventory_data["cpu_model"] = platform.processor() # Fallback

    
    mem = psutil.virtual_memory()
    inventory_data["ram_total_gb"] = round(mem.total / (1024**3), 2)
    inventory_data["ram_available_gb"] = round(mem.available / (1024**3), 2) # RAM disponível adicionada

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

if __name__ == "__main__":
    # Carrega a configuração no início para que o log_level seja definido globalmente.
    config = load_config()

    log_event("Script do agente iniciado.", "INFO")
    log_event("AVISO ! VOCE ESTA EM DEBUG MODE, CUIDADO COM A PERFORMANCE.", "DEBUG")
    
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

    # Realiza o check-in
    check_in_successful = perform_check_in(config)
    
    if check_in_successful:
        log_event("Processo de check-in concluído com sucesso.", "INFO")
    else:
        log_event("Processo de check-in falhou. Veja logs anteriores para detalhes.", "WARNING")

    # Coleta e salva o inventário completo do sistema localmente.
    log_event("Coletando inventário completo do sistema para salvamento local...", "INFO")
    # Passa o agent_id confirmado para get_system_inventory
    full_inventory = get_system_inventory(config["agent_id"]) 
    
    try:
        with open(INVENTORY_FILE, "w", encoding="utf-8") as f:
            json.dump(full_inventory, f, indent=4, ensure_ascii=False)
        log_event(f"Inventário completo salvo localmente em: {INVENTORY_FILE}", "INFO")
    except Exception as e:
        log_event(f"Erro ao salvar inventário completo em {INVENTORY_FILE}: {e}", "ERROR")
        
    log_event("Script do agente finalizado.", "INFO")
