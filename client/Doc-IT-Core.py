import os
import sys
import json
import time
import socket
import threading
import subprocess
from datetime import datetime
import requests
import urllib3
import traceback

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# --- Configurações Básicas ---
CONFIG_FILE = "config.json"
LOG_FILE = "agent-core.log"
AGENT_VERSION = "2.0.6"

DEFAULT_CONFIG = {
    "server_base_url": "https://localhost:3000",
    "agent_id": None,
    "last_successful_checkin": None,
    "log_level": "INFO",
    "cert_path": "./certs/agent.crt",
    "key_path": "./certs/agent.key",
    "ca_path": "./certs/ca.crt"
}

LOG_LEVELS = {"DEBUG": 10, "INFO": 20, "WARNING": 30, "ERROR": 40, "CRITICAL": 50}
config = {}

# --- Logger Centralizado (Core) ---
def log_event(message, level="INFO"):
    global config
    min_level_str = config.get("log_level", "INFO").upper()
    min_level = LOG_LEVELS.get(min_level_str, 20)
    msg_level = LOG_LEVELS.get(level.upper(), 20)
    
    if msg_level >= min_level:
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        log_entry = f"{timestamp} [{level.upper()}] [CORE] - {message}\n"
        try:
            with open(LOG_FILE, "a", encoding='utf-8') as f:
                f.write(log_entry)
        except Exception as e:
            print(f"Falha ao escrever no arquivo de log: {e}")

# Hooks e Tratamento de Exceções
def handle_exception(exc_type, exc_value, exc_traceback):
    if issubclass(exc_type, KeyboardInterrupt):
        sys.__excepthook__(exc_type, exc_value, exc_traceback)
        return
    log_event(f"CRASH CORE (Main):\n" + "".join(traceback.format_exception(exc_type, exc_value, exc_traceback)), "CRITICAL")
    sys.exit(1)

sys.excepthook = handle_exception

def handle_thread_exception(args):
    log_event(f"CRASH CORE (Thread {args.thread.name}):\n" + "".join(traceback.format_exception(args.exc_type, args.exc_value, args.exc_traceback)), "CRITICAL")

threading.excepthook = handle_thread_exception


# --- Gerenciamento de Configuração Básica ---
def load_config():
    if not os.path.exists(CONFIG_FILE):
        log_event(f"Arquivo de configuração não encontrado. Criando padrão.", "WARNING")
        save_config(DEFAULT_CONFIG)
        return DEFAULT_CONFIG
    try:
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            loaded_config = json.load(f)
            for key, value in DEFAULT_CONFIG.items():
                if key not in loaded_config:
                    loaded_config[key] = value
            return loaded_config
    except Exception as e:
        log_event(f"Erro ao ler config: {e}. Usando fallback.", "ERROR")
        save_config(DEFAULT_CONFIG)
        return DEFAULT_CONFIG

def save_config(config_data):
    try:
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(config_data, f, indent=4, ensure_ascii=False)
    except Exception as e:
        log_event(f"Erro ao salvar config: {e}", "ERROR")

# Substitui as antigas funções pesadas por algo rápido para o Core Boot
def get_windows_hardware_uuid():
    try:
        result = subprocess.check_output("wmic csproduct get uuid", shell=True, text=True, stderr=subprocess.DEVNULL)
        hardware_uuid = result.strip().split("\n")[-1].strip()
        if hardware_uuid and len(hardware_uuid) > 5 and hardware_uuid != "FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF":
            return hardware_uuid
    except Exception:
        pass
    import uuid
    return str(uuid.uuid4())


# --- Comunicação com Backend via mTLS (Check-in Leve) ---
def perform_core_check_in(config, inventory_payload=None):
    """ O Core notifica que está vivo. Se tiver inventory_payload (repassado via IPC), ele anexa na request. """
    check_in_url = f"{config.get('server_base_url')}/agent/check-in"
    
    import platform
    import getpass
    try:
        osUser = getpass.getuser()
    except:
        osUser = "Unknown"
        
    payload = {
        "agentId": config.get("agent_id"),
        "hostname": socket.gethostname(),
        "osUsername": osUser,
        "ipAddress": "127.0.0.1", # Simplificado para o core (o módulo de rede acha o real)
        "agentVersion": AGENT_VERSION,
        "osInfo": f"{platform.system()} {platform.release()}"
    }

    if inventory_payload:
        payload["additionalData"] = inventory_payload
        # Se veio inventário da interface IPC, atualiza o IP da maquina
        if "network_interfaces" in inventory_payload:
            for d in inventory_payload["network_interfaces"]:
                for ip in d.get("ipv4_addresses", []):
                    payload["ipAddress"] = ip.get("ip_address", payload["ipAddress"])
    
    # Sempre injeta as versões dos módulos no additionalData
    if "additionalData" not in payload or payload["additionalData"] is None:
        payload["additionalData"] = {}
    
    # Lê as versões dos módulos do arquivo gerado pelo build_publish.py
    mod_versions = {"core": AGENT_VERSION}
    try:
        mv_path = os.path.join(os.path.dirname(sys.executable) if getattr(sys, 'frozen', False) else '.', "module_versions.json")
        if os.path.exists(mv_path):
            with open(mv_path, 'r', encoding='utf-8') as _f:
                mod_versions = json.load(_f)
        # Garante que o Core sempre reflete a versão real em execução
        mod_versions["core"] = AGENT_VERSION
    except:
        pass
    
    payload["additionalData"]["module_versions"] = mod_versions

    if not payload["agentId"]:
        return False, None

    cert_path = config.get("cert_path")
    key_path = config.get("key_path")
    ca_path = config.get("ca_path")

    if not (os.path.exists(cert_path) and os.path.exists(key_path) and os.path.exists(ca_path)):
        log_event("Certificados mTLS ausentes. Check-in falhou.", "ERROR")
        return False, None

    try:
        response = requests.post(check_in_url, json=payload, timeout=20, cert=(cert_path, key_path), verify=ca_path)
        response.raise_for_status() 
        global_settings = response.json()
        
        # Pega configuracoes do pool
        settings_url = f"{config.get('server_base_url')}/settings/agent"
        set_response = requests.get(settings_url, timeout=10, cert=(cert_path, key_path), verify=ca_path)
        if set_response.status_code == 200:
            return True, set_response.json()
            
        return True, None
    except Exception as e:
        log_event(f"Falha de rede no Checkin mTLS: {e}", "ERROR")
        return False, None


# --- Orquestração de Submódulos ---
MODULES = {
    "inventory": {"exe": "Doc-IT-Inventory.exe", "process": None},
    "remote": {"exe": "Doc-IT-Remote.exe", "process": None},
    "updater": {"exe": "Doc-IT-Updater.exe", "process": None}
}

IPC_PORT = 49152 # Porta TCP Local Alta para RPC interno

def start_module(module_name):
    """Inicia um daemon submódulo (caso ele não esteja rodando)."""
    exe_name = MODULES[module_name]["exe"]
    if not os.path.exists(exe_name):
        log_event(f"Atenção: Submódulo {exe_name} não encontrado no disco local.", "WARNING")
        return

    # Se já existir um processo vinculado e ele estiver vivo não faz nada
    p = MODULES[module_name]["process"]
    if p and p.poll() is None:
        return 

    try:
        # TODO: A criação de processo para o módulo Remote terá que ser ajustada no futuro
        # para usar CreateProcessAsUser (Sessão 1) quando esse Core virar um Windows Service
        # Por hora, spawnamos ele normalmente.
        log_event(f"Spawnando Submódulo: {exe_name}...", "INFO")
        
        # Correção: Enviar stdout/stderr para DEVNULL evita deadlocks de buffer 
        # que causam "Failed to extract _tcl_data" no PyInstaller quando múltiplos EXES iniciam
        new_process = subprocess.Popen([exe_name], 
                                     stdout=subprocess.DEVNULL, 
                                     stderr=subprocess.DEVNULL,
                                     creationflags=subprocess.CREATE_NO_WINDOW)
        MODULES[module_name]["process"] = new_process
    except Exception as e:
        log_event(f"Erro ao instanciar módulo {module_name}: {e}", "ERROR")

def keep_modules_alive_loop():
    """Thread em background que garante que todos os módulos definidos estão rodando."""
    while True:
        start_module("inventory")
        start_module("updater")
        start_module("remote")
        time.sleep(10) # Checa a cada 10s


# --- Servidor IPC Local (Para receber dados dos submódulos) ---
def ipc_local_server():
    """
    Servidor Socket TCP local exclusivo para receber dados assíncronos dos módulos.
    Ex: O arquivo Doc-IT-Inventory.exe coleta pesado durante 1 minuto, e depois cospe
    os dados nesse socket pro Core reenviar ao Backend.
    """
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.bind(('127.0.0.1', IPC_PORT))
    server.listen(5)
    log_event(f"Servidor IPC interno ouvindo na porta {IPC_PORT}", "INFO")

    while True:
        try:
            client, addr = server.accept()
            threading.Thread(target=handle_ipc_client, args=(client,), daemon=True).start()
        except Exception as e:
            log_event(f"Erro ao aceitar conexão IPC Local: {e}", "ERROR")

def handle_ipc_client(client_socket):
    try:
        data = b""
        while True:
            chunk = client_socket.recv(4096)
            if not chunk:
                break
            data += chunk

        payload = json.loads(data.decode('utf-8'))
        action = payload.get("action")
        
        if action == "inventory_ready":
            inv_data = payload.get("data")
            log_event("Inventário recebido via IPC do submódulo Inventory! Repassando ao Backend...", "INFO")
            perform_core_check_in(config, inventory_payload=inv_data)
        
        elif action == "restart_request":
            log_event("O Sub-Updater pediu encerramento do Core. Finalizando processos...", "WARNING")
            for m in MODULES.values():
                if m["process"]:
                    try: m["process"].kill()
                    except: pass
            sys.exit(0)
            
        # ========================================================
        # Relays: Sub-Módulo Remote -> Core -> Node.js (WebSocket)
        # ========================================================
        elif action == "desktop_frame":
            # O módulo remoto zipou um JPG em um Base64 gigante, joga no socket em tempo real
            if 'sio' in globals() and sio.connected:
                sio.emit('desktop:frame', {
                    'agentId': config.get("agent_id"),
                    'imageB64': payload["data"]["imageB64"],
                    'width': payload["data"]["width"],
                    'height': payload["data"]["height"]
                })
                
        elif action == "terminal_output":
            if 'sio' in globals() and sio.connected:
                sio.emit('terminal:output', {
                    'agentId': config.get("agent_id"),
                    'data': payload["data"]["text"]
                })
                
        elif action == "monitor_list":
            if 'sio' in globals() and sio.connected:
                sio.emit('desktop:monitor_list', {
                    'agentId': config.get("agent_id"),
                    'monitors': payload["data"]["monitors"]
                })
            
    except Exception as e:
        log_event(f"Erro mapeando payload IPC local: {e}", "ERROR")
    finally:
        client_socket.close()


def send_ipc_command(module_name, payload):
    """Envia um comando Socket para um submódulo."""
    target_port = None
    if module_name == "remote": target_port = 49153
    elif module_name == "inventory": target_port = 49154
    elif module_name == "updater": target_port = 49155
    
    if not target_port: return
    
    try:
        client = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        client.settimeout(2)
        client.connect(('127.0.0.1', target_port))
        client.sendall(json.dumps(payload).encode('utf-8'))
        client.close()
    except Exception as e:
         log_event(f"Falha ao enviar IPC para o submódulo '{module_name}' na porta {target_port}: {e}", "WARNING")


# =========================================================
# MAIN ENTRYPOINT
# =========================================================
if __name__ == "__main__":
    config = load_config()
    log_event("==== DOC-IT CORE INITIALIZED ====", "INFO")

    if not config.get("agent_id"):
        config["agent_id"] = get_windows_hardware_uuid()
        save_config(config)

    threading.Thread(target=ipc_local_server, daemon=True).start()

    success, settings = perform_core_check_in(config)

    threading.Thread(target=keep_modules_alive_loop, daemon=True).start()

    # --- Websocket (Conector Mestre de Comandos de Tela/Terminal) ---
    import socketio
    sio = socketio.Client(ssl_verify=False)

    @sio.event
    def connect():
        log_event("Websocket do Core conectado!", "INFO")

    # ========================================================
    # Relays: Node.js (WebSocket) -> Core -> Sub-Módulo Remote
    # ========================================================
    
    @sio.on('terminal:start')
    def proxy_terminal_start(data):
        if data.get('agentId') != config['agent_id']: return
        send_ipc_command("remote", {"cmd": "start_terminal"})
        
    @sio.on('terminal:stop')
    def proxy_terminal_stop(data):
        if data.get('agentId') != config['agent_id']: return
        send_ipc_command("remote", {"cmd": "stop_terminal"})
        
    @sio.on('terminal:data')
    def proxy_terminal_data(data):
        if data.get('agentId') != config['agent_id']: return
        send_ipc_command("remote", {"cmd": "input_terminal", "data": {"text": data.get('data')}})

    @sio.on('desktop:start')
    def proxy_desktop_start(data):
        if data.get('agentId') != config['agent_id']: return
        send_ipc_command("remote", {"cmd": "start_desktop", "data": data})

    @sio.on('desktop:stop')
    def proxy_desktop_stop(data):
        if data.get('agentId') != config['agent_id']: return
        send_ipc_command("remote", {"cmd": "stop_desktop"})

    @sio.on('desktop:mouse_move')
    def proxy_mouse_move(data):
        if data.get('agentId') != config['agent_id']: return
        send_ipc_command("remote", {"cmd": "mouse_move", "data": data})

    @sio.on('desktop:mouse_click')
    def proxy_mouse_click(data):
        if data.get('agentId') != config['agent_id']: return
        send_ipc_command("remote", {"cmd": "mouse_click", "data": data})

    @sio.on('desktop:key_down')
    def proxy_key_down(data):
        if data.get('agentId') != config['agent_id']: return
        send_ipc_command("remote", {"cmd": "key_down", "data": data})

    @sio.on('desktop:get_monitors')
    def proxy_get_monitors(data):
        if data.get('agentId') != config['agent_id']: return
        send_ipc_command("remote", {"cmd": "get_monitors"})


    socket_url = config.get('server_base_url')
    while True:
        try:
            sio.connect(socket_url, headers={'x-agent-id': config.get("agent_id")})
            sio.wait()
        except:
            time.sleep(10)
