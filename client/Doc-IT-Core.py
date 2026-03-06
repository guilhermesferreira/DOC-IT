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
import win32serviceutil
import win32service
import win32event
import servicemanager
import win32process
import win32security
import win32api
import win32con
import win32ts
import win32profile
import socketio
import psutil
from cryptography.fernet import Fernet
import base64
import win32file
from cryptography.fernet import Fernet
import base64

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


# --- Configurações Básicas ---
CONFIG_FILE = "Doc-IT.dat"
LEGACY_CONFIG_FILE = "config.json"
LOG_FILE = "agent-core.log"
AGENT_VERSION = "2.0.43"

# Chave Criptográfica Fixa (Hardcoded para o Build)
# Em produção real, este executável é obfusquado pelo PyArmor/Nuitka.
ENCRYPTION_KEY = b'r7xK9sLpR2vM4N8wQ3tA5yB1uC6zD0fHjI7oP9lK3nU='
cipher_suite = Fernet(ENCRYPTION_KEY)

DEFAULT_CONFIG = {
    "server_base_url": "https://localhost:3000",
    "agent_id": None,
    "last_successful_checkin": None,
    "log_level": "INFO",
    "cert_path": "./certs/agent.crt",
    "key_path": "./certs/agent.key",
    "ca_path": "./certs/ca.crt",
    "tamper_enabled": True,
    "tamper_password": None
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


# --- Gerenciamento de Configuração Básica (Criptografada) ---
def load_config():
    global cipher_suite
    
    # 1. Tenta carregar o novo formato seguro
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "rb") as f:
                encrypted_data = f.read()
                decrypted_data = cipher_suite.decrypt(encrypted_data)
                loaded_config = json.loads(decrypted_data.decode('utf-8'))
                
            # Verifica campos padrão ausentes
            for key, value in DEFAULT_CONFIG.items():
                if key not in loaded_config:
                    loaded_config[key] = value
            return loaded_config
        except Exception as e:
            log_event(f"Falha CRÍTICA ao decriptar {CONFIG_FILE}. Arquivo corrompido ou chave inválida: {e}", "ERROR")
            # Não recria o config vazio automaticamente aqui se falhou em decriptar, para evitar reset.
            # Mas na primeira execução (onde nem legacy existe), ele fará isso.

    # 2. Se .dat não existe, procura o JSON legado (Migração)
    if os.path.exists(LEGACY_CONFIG_FILE):
        log_event(f"Arquivo legado {LEGACY_CONFIG_FILE} detectado. Iniciando migração segura para {CONFIG_FILE}...", "INFO")
        try:
            with open(LEGACY_CONFIG_FILE, "r", encoding="utf-8") as f:
                loaded_config = json.load(f)
                
            for key, value in DEFAULT_CONFIG.items():
                if key not in loaded_config:
                    loaded_config[key] = value
            
            # Salva no novo formato
            save_config(loaded_config)
            
            # Deleta o JSON antigo para proteger os dados (como a URL do server)
            try:
                os.remove(LEGACY_CONFIG_FILE)
                log_event(f"Migração concluída. {LEGACY_CONFIG_FILE} destruído com sucesso.", "INFO")
            except Exception as d_e:
                 log_event(f"Falha ao jogar no lixo o {LEGACY_CONFIG_FILE}: {d_e}", "WARNING")
                 
            return loaded_config
        except Exception as e:
            log_event(f"Erro ao ler legacy config para migração: {e}", "ERROR")

    # 3. Se nada existe, é uma instalação crua. Cria o default bloqueado do zero.
    log_event(f"Nenhum arquivo de configuração encontrado. Criando base em {CONFIG_FILE}.", "WARNING")
    save_config(DEFAULT_CONFIG)
    return DEFAULT_CONFIG

def save_config(config_data):
    global cipher_suite
    try:
        json_str = json.dumps(config_data, ensure_ascii=False)
        encrypted_data = cipher_suite.encrypt(json_str.encode('utf-8'))
        
        with open(CONFIG_FILE, "wb") as f:
            f.write(encrypted_data)
            
        try:
            apply_strict_acl(CONFIG_FILE)
        except Exception as acl_e:
            log_event(f"Falha ao fixar ACL no .dat: {acl_e}", "WARNING")
            
    except Exception as e:
        log_event(f"Erro ao salvar config criptografada: {e}", "CRITICAL")

def apply_strict_acl(filepath):
    """
    Remove as permissões herdadas e cede controle absoluto apenas para SYSTEM
    e o grupo de Administradores Locais, impedindo que usuários não-admin
    visualizem, copiem ou deletem o Doc-IT.dat
    """
    if not os.path.exists(filepath):
        return
        
    try:
        # Pega a Descriptor atual
        sd = win32security.GetFileSecurity(filepath, win32security.DACL_SECURITY_INFORMATION)
        
        # Cria uma nova DACL Vazia
        dacl = win32security.ACL()
        
        # SIDs Bem conhecidos
        # S-1-5-18 = Local System
        sid_system = win32security.ConvertStringSidToSid("S-1-5-18")
        # S-1-5-32-544 = Built-in Administrators
        sid_admins = win32security.ConvertStringSidToSid("S-1-5-32-544")
        
        # Adiciona Generic All (Full Control) para System e Admin na Dacl
        dacl.AddAccessAllowedAce(win32security.ACL_REVISION, win32con.GENERIC_ALL, sid_system)
        dacl.AddAccessAllowedAce(win32security.ACL_REVISION, win32con.GENERIC_ALL, sid_admins)
        
        # Seta a DACL customizada de volta pro Security Descriptor e aplica no arquivo
        sd.SetSecurityDescriptorDacl(1, dacl, 0)
        
        # Aplicamos uma trava contra herança (PROTECTED_DACL_SECURITY_INFORMATION)
        win32security.SetFileSecurity(
            filepath, 
            win32security.DACL_SECURITY_INFORMATION | win32security.PROTECTED_DACL_SECURITY_INFORMATION, 
            sd
        )
    except Exception as e:
        log_event(f"Erro protegendo arquivo ACL {filepath}: {e}", "WARNING")

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

def get_logged_in_user():
    """Detecta o usuário humano na sessão de console (Session 1+)."""
    try:
        session_id = win32ts.WTSGetActiveConsoleSessionId()
        if session_id != 0xFFFFFFFF:
            user = win32ts.WTSQuerySessionInformation(None, session_id, win32ts.WTSUserName)
            if user and user.strip():
                return user
    except:
        pass
    try:
        users = psutil.users()
        if users: return users[0].name
    except: pass
    return "Desconhecido"

def get_primary_ip():
    """Identifica o IP que sai para a internet (UDP trick)."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except:
        return "127.0.0.1"


# --- Comunicação com Backend via mTLS (Check-in Leve) ---
import ctypes

def get_file_version(path):
    """Lê a versão (ProductVersion) diretamente dos metadados do executável via API do Windows."""
    if not os.path.exists(path):
        return None
    try:
        size = ctypes.windll.version.GetFileVersionInfoSizeW(path, None)
        if not size: return None
        buffer = ctypes.create_string_buffer(size)
        ctypes.windll.version.GetFileVersionInfoW(path, None, size, buffer)
        length = ctypes.c_uint()
        ptr = ctypes.c_void_p()
        ctypes.windll.version.VerQueryValueW(buffer, '\\VarFileInfo\\Translation', ctypes.byref(ptr), ctypes.byref(length))
        if length.value >= 4:
            data = ctypes.string_at(ptr, 4)
            lang = data[1] << 8 | data[0]
            cp = data[3] << 8 | data[2]
            key = f'\\StringFileInfo\\{lang:04x}{cp:04x}\\ProductVersion'
            ctypes.windll.version.VerQueryValueW(buffer, key, ctypes.byref(ptr), ctypes.byref(length))
            if length.value > 0:
                return ctypes.wstring_at(ptr, length.value).strip('\x00')
    except:
        pass
    return None

def perform_core_check_in(config, inventory_payload=None):
    """ O Core notifica que está vivo. Itera pela lista de server_urls até encontrar um que responda. """
    
    payload = {
        "agentId": config.get("agent_id"),
        "hostname": socket.gethostname(),
        "osUsername": get_logged_in_user(),
        "ipAddress": get_primary_ip(),
        "agentVersion": AGENT_VERSION,
        "osInfo": f"{platform.system()} {platform.release()}"
    }

    if inventory_payload:
        payload["additionalData"] = inventory_payload
        if "network_interfaces" in inventory_payload:
            for d in inventory_payload["network_interfaces"]:
                for ip in d.get("ipv4_addresses", []):
                    payload["ipAddress"] = ip.get("ip_address", payload["ipAddress"])
    
    if "additionalData" not in payload or payload["additionalData"] is None:
        payload["additionalData"] = {}
    
    # Coleta versões reais dos executáveis no disco
    mod_versions = {"core": AGENT_VERSION}
    try:
        base_dir = os.path.dirname(sys.executable) if getattr(sys, 'frozen', False) else '.'
        for m_key in ["inventory", "remote", "updater", "gui"]:
            exe_name = f"Doc-IT-{m_key.capitalize()}.exe"
            v = get_file_version(os.path.join(base_dir, exe_name))
            if v:
                mod_versions[m_key] = v
            else:
                # Fallback para o que estiver no config se não conseguir ler do disco
                mod_versions[m_key] = "0.0.0"
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

    # Failover: tenta cada URL da lista até uma funcionar
    server_urls = config.get("server_urls", [config.get("server_base_url")])
    
    for url in server_urls:
        try:
            check_in_url = f"{url}/agent/check-in"
            # Se a URL for um IP, desabilita a verificação de hostname para evitar SSLError mismatch, mas mantém mTLS
            verify_ssl = ca_path
            is_ip = re.match(r"https?://\d+\.\d+\.\d+\.\d+", url)
            if is_ip: verify_ssl = False
            
            response = requests.post(check_in_url, json=payload, timeout=10, cert=(cert_path, key_path), verify=verify_ssl)
            response.raise_for_status()
            
            # Sucesso! Persiste essa URL como a ativa
            if url != config.get("server_base_url"):
                config["server_base_url"] = url
                save_config(config)
                log_event(f"Servidor ativo descoberto: {url}", "INFO")
                
            # Atualização do modelo Tamper usando a resposta JSON normal do Check-in
            checkin_resp = response.json()
            tamper_changed = False
            
            if "tamperEnabled" in checkin_resp:
                new_tamper_flag = bool(checkin_resp["tamperEnabled"])
                if config.get("tamper_enabled") != new_tamper_flag:
                    log_event(f"Configuração do Tamper Protecion alterada remotamente para: {new_tamper_flag}", "WARNING")
                    config["tamper_enabled"] = new_tamper_flag
                    tamper_changed = True
                    
            if "tamperPassword" in checkin_resp and checkin_resp["tamperPassword"]:
                new_tamper_pass = checkin_resp["tamperPassword"]
                if config.get("tamper_password") != new_tamper_pass:
                    log_event("Nova Senha Tamper Offline recarregada do Servidor.", "WARNING")
                    config["tamper_password"] = new_tamper_pass
                    tamper_changed = True
                    
            if tamper_changed:
                save_config(config)
            
            settings_url = f"{url}/settings/agent"
            # Mesma lógica de bypass de hostname para IP
            verify_ssl = ca_path
            if re.match(r"https?://\d+\.\d+\.\d+\.\d+", url): verify_ssl = False
            
            set_response = requests.get(settings_url, timeout=10, cert=(cert_path, key_path), verify=verify_ssl)
            if set_response.status_code == 200:
                return True, set_response.json()
                
            return True, None
        except Exception as e:
            log_event(f"Tentativa de check-in em {url} falhou: {e}", "WARNING")
            continue
    
    log_event("Nenhum servidor respondeu ao check-in. Todas as URLs falharam.", "ERROR")
    return False, None


# --- Orquestração de Submódulos ---
def cleanup_ghost_processes():
    target_exes = ["Doc-IT-Inventory.exe", "Doc-IT-Remote.exe", "Doc-IT-Updater.exe", "Doc-IT-GUI.exe"]
    try:
        for proc in psutil.process_iter(['name']):
            try:
                if proc.info['name'] in target_exes:
                    proc.kill()
            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                pass
    except Exception as e:
        log_event(f"Aviso ao varrer processos fantasmas: {e}", "WARNING")

MODULES = {
    "inventory": {"exe": "Doc-IT-Inventory.exe", "process": None},
    "remote": {"exe": "Doc-IT-Remote.exe", "process": None},
    "updater": {"exe": "Doc-IT-Updater.exe", "process": None},
    "gui": {"exe": "Doc-IT-GUI.exe", "process": None}
}

IPC_PORT = 49152 # Porta TCP Local Alta para RPC interno

class Win32ProcessWrapper:
    def __init__(self, hProcess):
        self.hProcess = hProcess
    def poll(self):
        try:
            code = win32process.GetExitCodeProcess(self.hProcess)
            return None if code == win32con.STILL_ACTIVE else code
        except: return 1
    def kill(self):
        try: win32api.TerminateProcess(self.hProcess, 1)
        except: pass

def spawn_process_in_session_1(exe_path):
    """Bypasses Session 0 Isolation to launch a GUI-capable process in the active user session."""
    try:
        session_id = win32ts.WTSGetActiveConsoleSessionId()
        if session_id == 0xFFFFFFFF:
            log_event("Nenhuma sessão de console ativa encontrada. Remote Module aguardando login.", "WARNING")
            return None
            
        h_token = win32ts.WTSQueryUserToken(session_id)
        env = win32profile.CreateEnvironmentBlock(h_token, False)
        
        si = win32process.STARTUPINFO()
        si.lpDesktop = "winsta0\\default"
        si.dwFlags = win32process.STARTF_USESHOWWINDOW
        si.wShowWindow = win32con.SW_HIDE

        creation_flags = win32con.NORMAL_PRIORITY_CLASS | win32con.CREATE_UNICODE_ENVIRONMENT | 0x08000000
        
        hProcess, hThread, dwProcessId, dwThreadId = win32process.CreateProcessAsUser(
            h_token,
            None,
            f'"{exe_path}"',
            None,
            None,
            False,
            creation_flags,
            env,
            os.path.dirname(os.path.abspath(exe_path)),
            si
        )
        return Win32ProcessWrapper(hProcess)
    except Exception as e:
        log_event(f"Erro Crítico de IPC/Session 0 Bypass ao instanciar {exe_path}: {e}", "CRITICAL")
        return None

def start_module(module_name):
    """Verifica e inicia um módulo. Se ele já estiver rodando, não faz nada."""
    exe_name = f"Doc-IT-{module_name.capitalize()}.exe"
    
    if getattr(sys, 'frozen', False):
        exe_path = os.path.join(os.path.dirname(sys.executable), exe_name)
    else:
        exe_path = os.path.join(os.getcwd(), exe_name)

    if not os.path.exists(exe_path):
        # Fallback for dev mode
        if not os.path.exists(exe_name):
            log_event(f"Atenção: Submódulo {exe_name} não encontrado no disco local.", "WARNING")
            return
        else:
            exe_path = os.path.abspath(exe_name)

    p = MODULES[module_name]["process"]
    if p and p.poll() is None:
        return 

    try:
        log_event(f"Spawnando Submódulo: {exe_name}...", "INFO")
        
        if module_name in ["remote", "gui"]:
            new_process = spawn_process_in_session_1(exe_path)
            if new_process:
                MODULES[module_name]["process"] = new_process
        else:
            new_process = subprocess.Popen([exe_path], 
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
        start_module("gui")
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
        
        elif action == "get_config":
            # A GUI ou outro módulo pede a configuração atual (que o Core tem permissão de ler)
            log_event("Submódulo solicitou configuração via IPC.", "DEBUG")
            response = {"status": "success", "config": config}
            client_socket.sendall(json.dumps(response).encode('utf-8'))

        elif action == "restart_request":
            log_event("O Sub-Updater pediu encerramento do Core. Finalizando processos...", "WARNING")
            for m in MODULES.values():
                if m["process"]:
                    try: m["process"].kill()
                    except: pass
            cleanup_ghost_processes()
            # Deixa o Windows Service Manager cuidar do restart (configurado para 5s no Setup)
            # Sair com código != 0 aciona as 'failure actions' do serviço.
            log_event("Solicitando auto-reinicialização do serviço via SCM failure actions...", "WARNING")
            os._exit(1)
            
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


# --- Websocket (Conector Mestre de Comandos de Tela/Terminal) ---
sio = socketio.Client(ssl_verify=False)

@sio.event
def connect():
    log_event("Websocket do Core conectado!", "INFO")

@sio.on('terminal:start')
def proxy_terminal_start(data):
    if data.get('agentId') != config.get('agent_id'): return
    send_ipc_command("remote", {"cmd": "start_terminal"})
    
@sio.on('terminal:stop')
def proxy_terminal_stop(data):
    if data.get('agentId') != config.get('agent_id'): return
    send_ipc_command("remote", {"cmd": "stop_terminal"})
    
@sio.on('terminal:data')
def proxy_terminal_data(data):
    if data.get('agentId') != config.get('agent_id'): return
    send_ipc_command("remote", {"cmd": "input_terminal", "data": {"text": data.get('data')}})

@sio.on('desktop:start')
def proxy_desktop_start(data):
    if data.get('agentId') != config.get('agent_id'): return
    send_ipc_command("remote", {"cmd": "start_desktop", "data": data})

@sio.on('desktop:stop')
def proxy_desktop_stop(data):
    if data.get('agentId') != config.get('agent_id'): return
    send_ipc_command("remote", {"cmd": "stop_desktop"})

@sio.on('desktop:mouse_move')
def proxy_mouse_move(data):
    if data.get('agentId') != config.get('agent_id'): return
    send_ipc_command("remote", {"cmd": "mouse_move", "data": data})

@sio.on('desktop:mouse_click')
def proxy_mouse_click(data):
    if data.get('agentId') != config.get('agent_id'): return
    send_ipc_command("remote", {"cmd": "mouse_click", "data": data})

@sio.on('tamper:update')
def handle_tamper_update(data):
    """Recebe novo OTP do servidor, aplica localmente e confirma."""
    global config
    if data.get('agentId') != config.get('agent_id'): return
    
    new_pass = data.get('newPassword')
    if (new_pass):
        log_event(f"Recebido novo Tamper OTP do servidor. Sincronizando...", "INFO")
        config["tamper_password"] = new_pass
        config["tamper_enabled"] = True
        save_config(config)
        
        # Confirma o recebimento para o servidor
        sio.emit('tamper:confirmed', {
            'agentId': config.get('agent_id'),
            'status': 'success'
        })
        log_event("Sincronização de Tamper concluída e confirmada ao servidor.", "INFO")

@sio.on('desktop:key_down')
def proxy_key_down(data):
    if data.get('agentId') != config.get('agent_id'): return
    send_ipc_command("remote", {"cmd": "key_down", "data": data})

@sio.on('desktop:get_monitors')
def proxy_get_monitors(data):
    if data.get('agentId') != config.get('agent_id'): return
    send_ipc_command("remote", {"cmd": "get_monitors"})


class DocITAgentService(win32serviceutil.ServiceFramework):
    _svc_name_ = "DocITAgent"
    _svc_display_name_ = "Doc-IT Agent Service"
    _svc_description_ = "Orquestrador do Agente de Monitoramento e Sucesso Doc-IT."

    def __init__(self, args):
        win32serviceutil.ServiceFramework.__init__(self, args)
        self.hWaitStop = win32event.CreateEvent(None, 0, 0, None)
        self.is_running = True

    def SvcStop(self):
        self.ReportServiceStatus(win32service.SERVICE_STOP_PENDING)
        win32event.SetEvent(self.hWaitStop)
        self.is_running = False
        log_event("Recebido sinal de parada do Windows Service. Finalizando módulos suavemente...", "INFO")
        for m in MODULES.values():
            if m["process"]:
                try: m["process"].kill()
                except: pass
        
        # Aggressive cleanup on stop via native API instead of taskkill
        cleanup_ghost_processes()

    def SvcDoRun(self):
        servicemanager.LogMsg(
            servicemanager.EVENTLOG_INFORMATION_TYPE,
            servicemanager.PYS_SERVICE_STARTED,
            (self._svc_name_, '')
        )
        self.main()

    def main(self):
        global config
        # Troca o diretório de execução para a mesma pasta do EXE, evitando problemas do System32
        os.chdir(os.path.dirname(os.path.abspath(sys.executable if getattr(sys, 'frozen', False) else __file__)))
        
        config = load_config()
        log_event("==== DOC-IT CORE SERVICE INITIALIZED ====", "INFO")

        if not config.get("agent_id"):
            config["agent_id"] = get_windows_hardware_uuid()
            save_config(config)

        # Cleanup Any Ghost Processes Before Spawning New Ones (Native approach)
        log_event("Garantindo ambiente limpo. Purgando processos fantasmas via psutil...", "INFO")
        cleanup_ghost_processes()

        threading.Thread(target=ipc_local_server, daemon=True).start()

        success, settings = perform_core_check_in(config)

        threading.Thread(target=keep_modules_alive_loop, daemon=True).start()
        
        # Failover de WebSocket: tenta cada URL da lista
        server_urls = config.get('server_urls', [config.get('server_base_url')])
        
        while self.is_running:
            for socket_url in server_urls:
                if not self.is_running:
                    break
                try:
                    if not sio.connected:
                        sio.connect(socket_url, headers={'x-agent-id': config.get("agent_id")})
                        if sio.connected:
                            log_event(f"WebSocket conectado com sucesso em: {socket_url}", "INFO")
                            break
                except Exception as e:
                    pass
            
            if not self.is_running:
                break
                
            rc = win32event.WaitForSingleObject(self.hWaitStop, 5000)
            if rc == win32event.WAIT_OBJECT_0:
                break
                
        if sio.connected:
            sio.disconnect()


if __name__ == '__main__':
    if len(sys.argv) == 1:
        # Se for rodado pelo Service Control Manager sem argumentos
        servicemanager.Initialize()
        servicemanager.PrepareToHostSingle(DocITAgentService)
        servicemanager.StartServiceCtrlDispatcher()
    else:
        # Se for rodado com "install", "start", "stop", etc.
        win32serviceutil.HandleCommandLine(DocITAgentService)
