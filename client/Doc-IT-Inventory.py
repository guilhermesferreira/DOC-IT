import os
import sys
import json
import time
import socket
import platform
import subprocess
import getpass
from datetime import datetime
import traceback

import psutil # Módulo pesado
try:
    import winreg
    import wmi
    import pythoncom
    import win32ts
    import win32pipe
    import win32file
    import pywintypes
except ImportError:
    pass

# --- Configurações IPC ---
CORE_IPC_PIPE = r'\\.\pipe\DocIT_Core_IPC'

# Determina o diretório base do executável ou script
BASE_DIR = os.path.dirname(sys.executable) if getattr(sys, 'frozen', False) else os.path.dirname(os.path.abspath(__file__))

LOG_FILE = os.path.join(BASE_DIR, "agent-inventory.log")
AGENT_VERSION = "2.2.0"

def log_event(message, level="INFO"):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_entry = f"{timestamp} [{level.upper()}] [INVENTORY] - {message}\n"
    try:
        with open(LOG_FILE, "a", encoding='utf-8') as f:
            f.write(log_entry)
        print(log_entry.strip())
    except:
        pass

def handle_exception(exc_type, exc_value, exc_traceback):
    log_event(f"CRASH: " + "".join(traceback.format_exception(exc_type, exc_value, exc_traceback)), "CRITICAL")
    sys.exit(1)

sys.excepthook = handle_exception


# =========================================================
# FUNÇÕES DE COLETA (Migradas do antigo agente monolítico)
# =========================================================

def get_installed_software():
    software_list = []
    if platform.system() != "Windows": return []
    
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
                    try:
                        display_version, _ = winreg.QueryValueEx(subkey, "DisplayVersion")
                    except OSError:
                        display_version = "N/A"
                    if display_name.strip():
                        software_list.append({"name": display_name, "version": display_version})
                    winreg.CloseKey(subkey)
                except Exception:
                    pass
            winreg.CloseKey(key)
        except Exception:
            pass

    unique_software = []
    seen_software = set()
    for item in software_list:
        identifier = frozenset(item.items())
        if identifier not in seen_software:
            unique_software.append(item)
            seen_software.add(identifier)
    return sorted(unique_software, key=lambda x: x['name'].lower())

def get_cpu_model_clean():
    import re
    try:
        cpu_model_raw = platform.processor()
        if platform.system() == "Windows":
            try:
                registry_key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"HARDWARE\DESCRIPTION\System\CentralProcessor\0")
                cpu_model_raw, _ = winreg.QueryValueEx(registry_key, "ProcessorNameString")
                winreg.CloseKey(registry_key)
            except Exception:
                pass
        cpu_model_clean = re.sub(r'\((TM|tm|R|r)\)', '', cpu_model_raw).strip()
        return re.sub(r' +', ' ', cpu_model_clean)
    except Exception:
        return platform.processor()

def get_logged_in_user():
    """Detecta o usuário humano na sessão de console (ignora SYSTEM)."""
    try:
        session_id = win32ts.WTSGetActiveConsoleSessionId()
        if session_id != 0xFFFFFFFF:
            user = win32ts.WTSQuerySessionInformation(None, session_id, win32ts.WTSUserName)
            if user and user.strip():
                return user
    except:
        pass
    
    # Fallback para psutil se WTS falhar
    try:
        users = psutil.users()
        if users:
            return users[0].name
    except:
        pass
    return "Desconhecido"

def get_primary_ip():
    """Identifica o IP que sai para a internet (UDP trick)."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        # Não precisa conectar de verdade, apenas forçar o OS a escolher a rota
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except:
        return None

def get_local_users_info():
    users_data = {"local_accounts": [], "active_sessions": [], "current_user": get_logged_in_user()}
    try:
        if platform.system() == "Windows":
            output = subprocess.check_output(
                ["powershell", "-NoProfile", "-Command", "Get-LocalUser | Select-Object Name, Enabled | ConvertTo-Json -Compress"],
                text=True, stderr=subprocess.DEVNULL
            )
            if output.strip():
                try:
                    parsed_users = json.loads(output.strip())
                    if isinstance(parsed_users, dict): parsed_users = [parsed_users]
                    for u in parsed_users:
                        users_data["local_accounts"].append({
                            "name": u.get("Name", "Desconhecido"),
                            "enabled": u.get("Enabled", False)
                        })
                except json.JSONDecodeError:
                    pass
                    
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
    ad_data = {"domain_or_workgroup": "Desconhecido", "is_domain_joined": False, "applied_gpos": []}
    try:
        pythoncom.CoInitialize()
        c = wmi.WMI()
        for sys in c.Win32_ComputerSystem():
            ad_data["domain_or_workgroup"] = sys.Domain
            ad_data["is_domain_joined"] = sys.PartOfDomain
            
        # Coleta de Gateway via WMI
        for config in c.Win32_NetworkAdapterConfiguration(IPEnabled=True):
            if config.DefaultIPGateway:
                ad_data["gateway"] = config.DefaultIPGateway[0]
                break
            
        if ad_data["is_domain_joined"] and platform.system() == "Windows":
            output = subprocess.check_output(
                ["gpresult", "/Scope", "Computer", "/v"],
                text=True, stderr=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW
            )
            in_applied_section = False
            for line in output.split("\n"):
                clean_line = line.strip()
                if "Applied Group Policy Objects" in clean_line or ("Objetos de pol" in clean_line and "grupo aplicados" in clean_line):
                    in_applied_section = True
                    continue
                if in_applied_section and clean_line == "-" * len(clean_line) and len(clean_line) > 5:
                    continue
                if in_applied_section and clean_line == "":
                    in_applied_section = False
                    continue
                if in_applied_section and clean_line and "N/A" not in clean_line and "N/D" not in clean_line:
                    if clean_line not in ad_data["applied_gpos"]:
                        ad_data["applied_gpos"].append(clean_line)
    except Exception as e:
        log_event(f"Erro ao coletar AD/GPO info: {e}", "ERROR")
    finally:
        try: pythoncom.CoUninitialize()
        except: pass
    return ad_data

def get_windows_updates():
    updates_data = {"summary": "N/A", "details": []}
    try:
        pythoncom.CoInitialize()
        import win32com.client
        ua = win32com.client.Dispatch("Microsoft.Update.Session")
        update_searcher = ua.CreateUpdateSearcher()
        search_result = update_searcher.Search("IsInstalled=0 and Type='Software'")
        
        updates_data["summary"] = f"{search_result.Updates.Count} atualizações pendentes."
        for i in range(search_result.Updates.Count):
            update = search_result.Updates.Item(i)
            updates_data["details"].append({"title": update.Title, "is_mandatory": update.IsMandatory})
    except Exception as e:
         log_event(f"Erro ao verificar atualizações do Windows: {e}", "ERROR")
         updates_data["summary"] = f"Erro na verificação"
    finally:
        try: pythoncom.CoUninitialize()
        except: pass
    return updates_data

def get_security_info():
    security_data = {
        "firewall": {},
        "antivirus": {"name": "Sophos Endpoint", "installed": False, "running_services": []}
    }
    
    try:
        result = subprocess.check_output("netsh advfirewall show allprofiles state", shell=True, text=True, stderr=subprocess.DEVNULL)
        current_profile = None
        for line in result.split('\n'):
            line = line.strip()
            if "Profile Settings:" in line:
                current_profile = line.split()[0].lower()
            elif "State" in line and current_profile:
                state = line.split()[-1].lower()
                security_data["firewall"][current_profile] = state
                current_profile = None
    except Exception as e:
        security_data["firewall"]["error"] = "Não foi possível verificar"

    try:
        sophos_found = False
        sophos_services = []
        for service in psutil.win_service_iter():
            try:
                serv_name = service.name()
                serv_display = service.display_name()
                if "sophos" in serv_name.lower() or "sophos" in serv_display.lower():
                    sophos_found = True
                    is_running = service.status() == psutil.STATUS_RUNNING
                    sophos_services.append({"name": serv_display, "status": "Running" if is_running else "Stopped"})
            except:
                pass
        security_data["antivirus"]["installed"] = sophos_found
        security_data["antivirus"]["running_services"] = sophos_services
    except Exception:
        security_data["antivirus"]["error"] = "Não foi possível verificar serviços"
        
    return security_data


# --- Osquery Client Integration ---
class OsqueryClient:
    def __init__(self, bin_path=None):
        self.bin_path = bin_path or self._find_osquery()
        self.version = self.get_version() if self.bin_path else None

    def _find_osquery(self):
        # Locais de busca: pasta bin real da instalação do agente
        # Locais de busca: pasta bin real da instalação do agente
        locations = [
            os.path.join(BASE_DIR, "assets", "bin", "osqueryi.exe"),
            os.path.join(os.path.dirname(BASE_DIR), "backend", "updates", "osquery", "versions", "5.12.1", "osqueryi.exe"),
            "osqueryi.exe"
        ]
        for loc in locations:
            try:
                subprocess.check_output([loc, "--version"], stderr=subprocess.STDOUT, creationflags=subprocess.CREATE_NO_WINDOW)
                return loc
            except:
                continue
        return None

    def get_version(self):
        try:
            output = subprocess.check_output([self.bin_path, "--version"], text=True, creationflags=subprocess.CREATE_NO_WINDOW)
            # Ex: osqueryi version 5.12.1 -> 5.12.1
            parts = output.strip().split(" ")
            return parts[2] if len(parts) > 2 else parts[1]
        except:
            return "N/A"

    def is_available(self):
        return self.bin_path is not None

    def run_query(self, query):
        if not self.is_available():
            return None
        try:
            cmd = [self.bin_path, "--json", query]
            output = subprocess.check_output(cmd, text=True, creationflags=subprocess.CREATE_NO_WINDOW)
            return json.loads(output)
        except Exception as e:
            log_event(f"Osquery Query Error: {e}", "WARNING")
            return None

def get_additional_inventory_data():
    """Compila todo o json de telemetria (Híbrido: Osquery + Legacy Fallback)"""
    log_event(f"Gerando JSON de inventário...", "INFO")
    data = {}
    osq = OsqueryClient()
    
    data["osquery_version"] = osq.version if osq.is_available() else None
    
    # 1. CPU e Sistema
    if osq.is_available():
        sys_info = osq.run_query("SELECT cpu_brand, physical_memory, hardware_vendor, hardware_model FROM system_info LIMIT 1;")
        if sys_info:
            data["cpu_model"] = sys_info[0].get("cpu_brand", get_cpu_model_clean())
            # Memória via Osquery vem em bytes
            try: data["ram_total_gb"] = round(int(sys_info[0].get("physical_memory", 0)) / (1024**3), 2)
            except: data["ram_total_gb"] = round(psutil.virtual_memory().total / (1024**3), 2)
        else:
            data["cpu_model"] = get_cpu_model_clean()
            data["ram_total_gb"] = round(psutil.virtual_memory().total / (1024**3), 2)
    else:
        data["cpu_model"] = get_cpu_model_clean()
        data["ram_total_gb"] = round(psutil.virtual_memory().total / (1024**3), 2)

    # 2. Usuários
    if osq.is_available():
        osq_users = osq.run_query("SELECT user, tty, host FROM logged_in_users;")
        if osq_users is not None:
            data["users"] = get_local_users_info() # Mantém AD/GPO manual mas limpa as sessões se quiser
            # Sobrescreve sessões ativas com dados do Osquery (mais precisos)
            data["users"]["active_sessions"] = []
            for u in osq_users:
                data["users"]["active_sessions"].append({
                    "username": u.get("user"),
                    "terminal": u.get("tty", "N/A"),
                    "host": u.get("host", "local")
                })
        else:
            data["users"] = get_local_users_info()
    else:
        data["users"] = get_local_users_info()

    # 3. Informações de AD e GPO (Ainda WMI/PowerShell pois Osquery nativo tem limites aqui)
    data["ad_gpo"] = get_ad_gpo_info()

    # 4. RAM e Performance
    mem = psutil.virtual_memory()
    data["ram_available_gb"] = round(mem.available / (1024**3), 2)
    data["ram_used_gb"] = round((mem.total - mem.available) / (1024**3), 2)
    
    try: data["boot_time_timestamp"] = psutil.boot_time()
    except Exception: data["boot_time_timestamp"] = None

    # 5. Discos
    disks_info = []
    try:
        if osq.is_available():
            osq_disks = osq.run_query("SELECT device_id as device, type, free_space as free, size as total FROM logical_drives;")
            if osq_disks:
                for d in osq_disks:
                    total = int(d.get("total", 0))
                    free = int(d.get("free", 0))
                    if total > 0:
                        disks_info.append({
                            "drive_mountpoint": d.get("device"),
                            "total_gb": round(total / (1024**3), 2),
                            "used_gb": round((total - free) / (1024**3), 2),
                            "free_gb": round(free / (1024**3), 2),
                            "filesystem_type": d.get("type", "Unknown")
                        })
            
            if not disks_info: # Fallback psutil
                 partitions = psutil.disk_partitions(all=False)
                 for p in partitions:
                     if 'cdrom' in p.opts or p.fstype == '' or 'removable' in p.opts: continue
                     try:
                         usage = psutil.disk_usage(p.mountpoint)
                         disks_info.append({
                             "drive_mountpoint": p.mountpoint,
                             "total_gb": round(usage.total / (1024**3), 2),
                             "used_gb": round(usage.used / (1024**3), 2),
                             "free_gb": round(usage.free / (1024**3), 2),
                             "filesystem_type": p.fstype
                         })
                     except: pass
        else:
            partitions = psutil.disk_partitions(all=False)
            for p in partitions:
                if 'cdrom' in p.opts or p.fstype == '' or 'removable' in p.opts: continue
                try:
                    usage = psutil.disk_usage(p.mountpoint)
                    disks_info.append({
                        "drive_mountpoint": p.mountpoint,
                        "total_gb": round(usage.total / (1024**3), 2),
                        "used_gb": round(usage.used / (1024**3), 2),
                        "free_gb": round(usage.free / (1024**3), 2),
                        "filesystem_type": p.fstype
                    })
                except: pass
    except: pass
    data["disks"] = disks_info

    # 6. Redes
    data["primary_ip"] = get_primary_ip()
    if osq.is_available():
        osq_net = osq.run_query("SELECT interface, address, mask FROM interface_addresses WHERE address != '' AND address NOT LIKE '127.%' AND address NOT LIKE 'fe80:%' AND address NOT LIKE '::1';")
        if osq_net:
            network_interfaces_info = []
            for iface in osq_net:
                network_interfaces_info.append({
                    "interface_name": iface.get("interface"),
                    "ipv4_addresses": [{"ip_address": iface.get("address"), "netmask": iface.get("mask")}],
                    "mac_addresses": ["N/A"]
                })
            data["network_interfaces"] = network_interfaces_info
        else:
             data["network_interfaces"] = [] # psutil logic here if needed, but keeping simple
    else:
        # Fallback para a lógica pesada do psutil que já existia originalmente no inventário
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
        except: pass
        data["network_interfaces"] = network_interfaces_info

    # 7. Software e Segurança
    if osq.is_available():
        osq_sw = osq.run_query("SELECT name, version FROM programs LIMIT 1000;")
        if osq_sw:
            data["installed_software"] = [{"name": s.get("name"), "version": s.get("version")} for s in osq_sw]
        else:
            data["installed_software"] = get_installed_software()
    else:
        data["installed_software"] = get_installed_software()

    data["windows_updates"] = get_windows_updates()
    data["security"] = get_security_info()
    data["collection_timestamp"] = datetime.now().isoformat()
    return data


# --- Comunicação com o Core (IPC) ---
def push_inventory_to_core(payload):
    """Abre Named Pipe para o Core e empurra o payload."""
    try:
        ipc_message = {
            "action": "inventory_ready",
            "data": payload
        }
        
        handle = win32file.CreateFile(
            CORE_IPC_PIPE,
            win32file.GENERIC_READ | win32file.GENERIC_WRITE,
            0, None,
            win32file.OPEN_EXISTING,
            0, None
        )
        win32pipe.SetNamedPipeHandleState(handle, win32pipe.PIPE_READMODE_MESSAGE, None, None)
        win32file.WriteFile(handle, json.dumps(ipc_message).encode('utf-8'))
        win32file.CloseHandle(handle)
        log_event(f"Dados enviados com sucesso para o IPC do Core.", "INFO")
    except Exception as e:
         log_event(f"Falha ao empurrar dados de inventário pro Core IPC (Pipe {CORE_IPC_PIPE}). O Core está rodando? Erro: {e}", "ERROR")


# =========================================================
# MAIN ENTRYPOINT
# =========================================================
if __name__ == "__main__":
    log_event("==== DOC-IT INVENTORY MODULE INITIALIZED ====", "INFO")
    
    POLLING_MINUTES = 60
    
    # Loop Contínuo do Daemon. 
    # O módulo gasta ciclo de CPU num pico ao acordar, cria json pesado, transporta em milissegundos p/ o Core e dorme.
    while True:
        try:
            full_inventory = get_additional_inventory_data()
            push_inventory_to_core(full_inventory)
        except Exception as e:
            log_event(f"Erro catastrófico no loop de inventário: {e}", "ERROR")
            
        # Dorme (Nenhuma Janela, 0% CPU, quase 0 RAM) ate o prox tick 
        time.sleep(POLLING_MINUTES * 60)
