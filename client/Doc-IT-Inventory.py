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
except ImportError:
    pass

# --- Configurações IPC ---
CORE_IPC_PORT = 49152 # Inventário empurra os dados lidos de volta pro servidor IPC do Core
MY_IPC_PORT = 49154   # Porta Opcional caso o Core precise injetar comandos síncronos neste módulo

LOG_FILE = "agent-inventory.log"
AGENT_VERSION = "2.0.6"

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

def get_local_users_info():
    users_data = {"local_accounts": [], "active_sessions": []}
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


def get_additional_inventory_data():
    """Compila todo o json de telemetria"""
    log_event(f"Gerando JSON de inventário pesado...", "INFO")
    data = {}
    data["cpu_model"] = get_cpu_model_clean()
    data["users"] = get_local_users_info()
    data["ad_gpo"] = get_ad_gpo_info()

    mem = psutil.virtual_memory()
    data["ram_total_gb"] = round(mem.total / (1024**3), 2)
    data["ram_available_gb"] = round(mem.available / (1024**3), 2)
    data["ram_used_gb"] = round((mem.total - mem.available) / (1024**3), 2)
    
    try: data["boot_time_timestamp"] = psutil.boot_time()
    except Exception: data["boot_time_timestamp"] = None

    disks_info = []
    try:
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
        log_event(f"Erro ao coletar rede: {e}", "WARNING")
        
    data["network_interfaces"] = network_interfaces_info
    data["installed_software"] = get_installed_software()
    data["windows_updates"] = get_windows_updates()
    data["security"] = get_security_info()
    data["collection_timestamp"] = datetime.now().isoformat()
    return data


# --- Comunicação com o Core (IPC) ---
def push_inventory_to_core(payload):
    """Abre socket tcp leve para o Core e empurra o payload."""
    try:
        client = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        client.settimeout(10)
        client.connect(('127.0.0.1', CORE_IPC_PORT))
        
        ipc_message = {
            "action": "inventory_ready",
            "data": payload
        }
        client.sendall(json.dumps(ipc_message).encode('utf-8'))
        client.close()
        log_event("Dados enviados com sucesso paro o IPC do Core.", "INFO")
    except Exception as e:
         log_event(f"Falha ao empurrar dados de inventário pro Core IPC (Porta {CORE_IPC_PORT}): {e}. O Core está rodando?", "ERROR")


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
