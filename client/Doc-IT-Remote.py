import os
import sys
import json
import time
import socket
import threading
import subprocess
import base64
from datetime import datetime
import traceback
import win32pipe
import win32file
import win32security
import win32con
import pywintypes

# Bibliotecas pesadas focadas em Interface de Usuário
import mss
try:
    from PIL import Image
    import io
except ImportError:
    pass

try:
    import pyautogui
    pyautogui.FAILSAFE = False
except ImportError:
    pass


# --- Configurações IPC ---
CORE_IPC_PIPE = r'\\.\pipe\DocIT_Core_IPC'
MY_IPC_PIPE = r'\\.\pipe\DocIT_Remote_IPC'

# Token de Autenticação (Lido da Variável de Ambiente em segurança)
IPC_TOKEN = os.environ.get("DOCIT_IPC_TOKEN", "")

LOG_FILE = "agent-remote.log"
AGENT_VERSION = "2.0.22"

config = {}

def log_event(message, level="INFO"):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_entry = f"{timestamp} [{level.upper()}] [REMOTE] - {message}\n"
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


# --- Variáveis de Estado de Sessão ---
terminal_process = None
desktop_streaming = False
current_stream_id = 0
active_monitor_idx = 1
cached_monitor_geometry = {"left": 0, "top": 0, "width": 1920, "height": 1080}
osd_process = None

# --- OSD Subprocess Hijack ---
# O OSD (On Screen Display) é instanciado chamando esse mesmo executável com flag --osd
if len(sys.argv) >= 3 and sys.argv[1] == "--osd":
    viewer_name = sys.argv[2]
    try:
        # Importamos Tkinter APENAS DENTRO desta branch para que o wrapper normal não exploda
        # e jogue o erro 'Failed to extract _tcl_data' de Pyinstaller no background
        import tkinter as tk
        root = tk.Tk()
        root.overrideredirect(True)
        root.attributes("-alpha", 0.9)
        root.attributes("-topmost", True)
        root.config(bg='#d32f2f')
        label = tk.Label(root, text=f"Doc-IT: Sessão Remota Ativa por {viewer_name}", fg="white", bg="#d32f2f", font=("Segoe UI", 11, "bold"), padx=20, pady=5)
        label.pack()
        root.update_idletasks()
        screen_width = root.winfo_screenwidth()
        w = root.winfo_width()
        x = (screen_width // 2) - (w // 2)
        root.geometry(f"+{x}+0")
        root.mainloop()
    except Exception as e:
        log_event(f"Erro ao instanciar Tkinter no Subprocesso OSD: {e}", "ERROR")
    sys.exit(0)


# =========================================================
# FUNÇÕES DE STREAMING (Migradas)
# =========================================================

def push_to_core(action, data):
    """Envia um payload de resposta de volta pro Core via TCP IPC"""
    try:
        payload = {
            "action": action,
            "data": data,
            "token": IPC_TOKEN
        }
        
        # Se for um frame, tenta esperar pouco. Se falhar, pula o frame (Frame Skipping)
        try:
             win32pipe.WaitNamedPipe(CORE_IPC_PIPE, 50)
        except:
             return False # Core ocupado, aborta push (pula frame)

        handle = win32file.CreateFile(
            CORE_IPC_PIPE,
            win32file.GENERIC_READ | win32file.GENERIC_WRITE,
            0, None,
            win32file.OPEN_EXISTING,
            0, None
        )
        win32pipe.SetNamedPipeHandleState(handle, win32pipe.PIPE_READMODE_MESSAGE, None, None)
        win32file.WriteFile(handle, json.dumps(payload).encode('utf-8'))
        win32file.CloseHandle(handle)
        return True
    except Exception:
        return False
    finally:
        try: win32file.CloseHandle(handle)
        except: pass

def stream_screen(monitor_idx, quality_profile, stream_id):
    """Laço infinito de captura de tela com Frame Skipping e Detecção de Tela Estática"""
    global desktop_streaming
    
    # Perfis de qualidade otimizados para BANDA REAL (MJPEG sobre WebSocket + Base64)
    # Base64 adiciona ~33% overhead, então JPEG quality precisa ser conservador
    # Alvo de banda: low ~1Mbps, medium ~3Mbps, high ~6Mbps, ultra ~10Mbps
    profiles = {
        'low':    {'max_w': 854,  'max_h': 480,  'jpeg_q': 25, 'target_fps': 10},
        'medium': {'max_w': 1280, 'max_h': 720,  'jpeg_q': 35, 'target_fps': 15},
        'high':   {'max_w': 1280, 'max_h': 720,  'jpeg_q': 45, 'target_fps': 20},
        'ultra':  {'max_w': 1600, 'max_h': 900,  'jpeg_q': 50, 'target_fps': 24},
    }
    
    p = profiles.get(quality_profile, profiles['medium'])
    max_w = p['max_w']
    max_h = p['max_h']
    jpeg_quality = p['jpeg_q']
    min_frame_interval = 1.0 / p['target_fps']  # Intervalo mínimo entre frames
    
    last_frame_hash = None  # Para detecção de tela estática
    static_count = 0        # Quantos frames consecutivos foram idênticos
    last_send_time = 0      # Timestamp do último frame enviado

    try:
        with mss.mss() as sct:
            if monitor_idx < 0 or monitor_idx >= len(sct.monitors): 
                monitor_idx = 1
                
            monitor = sct.monitors[monitor_idx]
            
            while desktop_streaming and current_stream_id == stream_id:
                try:
                    # Respeita o FPS alvo: não captura mais rápido do que o necessário
                    elapsed = time.time() - last_send_time
                    if elapsed < min_frame_interval:
                        time.sleep(min_frame_interval - elapsed)
                    
                    sct_img = sct.grab(monitor)
                    # Utiliza sct_img.rgb para remover o padding de memória (strides) do Windows
                    img = Image.frombytes("RGB", sct_img.size, sct_img.rgb)
                    
                    if img.width > max_w or img.height > max_h:
                        img.thumbnail((max_w, max_h), Image.Resampling.BILINEAR)
                    
                    buffer = io.BytesIO()
                    img.save(buffer, format="JPEG", quality=jpeg_quality)
                    frame_bytes = buffer.getvalue()
                    
                    # Detecção de Tela Estática: compara hash rápido do frame comprimido
                    # Se a tela não mudou, não envia o frame (economia massiva de banda)
                    import hashlib
                    frame_hash = hashlib.md5(frame_bytes).digest()
                    
                    if frame_hash == last_frame_hash:
                        static_count += 1
                        # Tela parada: reduz polling progressivamente (0.2s → 0.5s → 1s)
                        if static_count > 30:
                            time.sleep(1.0)
                        elif static_count > 10:
                            time.sleep(0.5)
                        else:
                            time.sleep(0.2)
                        continue
                    
                    # Tela mudou: reseta contador e envia
                    last_frame_hash = frame_hash
                    static_count = 0
                    
                    b64_img = base64.b64encode(frame_bytes).decode('utf-8')
                    
                    # Push de frame pro Orquestrador (Core) com FRAME SKIPPING
                    success = push_to_core("desktop_frame", {
                        "imageB64": b64_img,
                        "width": img.width,
                        "height": img.height
                    })
                    
                    last_send_time = time.time()
                    
                    # Se o pipe estava ocupado, descansa um pouco antes da próxima tentativa
                    if not success:
                        time.sleep(0.05)
                        continue

                except Exception as e:
                     log_event(f"Erro capturando tela: {e}", "ERROR")
                     time.sleep(1) 
    except Exception as e:
         log_event(f"Falha gravíssima ao injetar Mss loop: {e}", "CRITICAL")
         
    log_event("Laço de Streaming Oculto (Thread) Encerrado.", "INFO")


def term_read_stdout():
    """Lê a saida infinita do Cmd Invisivel e cospe pro Core"""
    global terminal_process
    while True:
        if terminal_process is None or terminal_process.poll() is not None:
            break
        try:
            output_bytes = os.read(terminal_process.stdout.fileno(), 1024)
            if not output_bytes: break
            text = output_bytes.decode('cp850', errors='replace')
            push_to_core("terminal_output", {"text": text})
        except Exception:
            break

# =========================================================
# LÓGICA DO SERVIDOR IPC (Aguardando Comandos do Core)
# =========================================================

def execute_ipc_command(payload):
    global terminal_process, desktop_streaming, current_stream_id, osd_process
    
    cmd = payload.get("cmd")
    data = payload.get("data", {})
    
    if cmd == "start_terminal":
        log_event("IPC: Iniciando CMD Remoto Oculto.", "INFO")
        if terminal_process is None or terminal_process.poll() is not None:
             terminal_process = subprocess.Popen(
                ["cmd.exe", "/Q"],
                stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, bufsize=0,
                creationflags=subprocess.CREATE_NO_WINDOW
            )     
             threading.Thread(target=term_read_stdout, daemon=True).start()
             
    elif cmd == "stop_terminal":
        log_event("IPC: Matando CMD Remoto.", "INFO")
        if terminal_process and terminal_process.poll() is None:
            terminal_process.terminate()
            terminal_process = None

    elif cmd == "input_terminal":
        if terminal_process and terminal_process.poll() is None:
            char_data = data.get("text", "")
            if char_data:
                try:
                    terminal_process.stdin.write(char_data.encode('cp850'))
                    terminal_process.stdin.flush()
                except Exception as e:
                    log_event(f"Erro ao injetar caractere no CMD: {e}", "ERROR")

    elif cmd == "start_desktop":
        try: monitor_idx = int(data.get("monitorIndex", 1))
        except: monitor_idx = 1
        
        global active_monitor_idx, cached_monitor_geometry
        active_monitor_idx = monitor_idx
        
        # Cacheia geometria do monitor ativo para uso nos handlers de mouse
        # Evita criar mss.mss() a cada evento de mouse (era ~20x/s, causava crash)
        try:
            with mss.mss() as sct:
                if monitor_idx < 0 or monitor_idx >= len(sct.monitors):
                    monitor_idx = 1
                cached_monitor_geometry = sct.monitors[monitor_idx]
        except:
            cached_monitor_geometry = {"left": 0, "top": 0, "width": 1920, "height": 1080}
        
        quality = data.get("quality", "medium")
        invisible = data.get("invisible_mode", False)
        viewer = data.get("viewer", "Administrador")
        
        # OSD Logic
        try:
            if osd_process and osd_process.poll() is None:
                osd_process.kill()
                osd_process = None
        except: pass

        if not invisible:
            import sys
            try:
                if getattr(sys, 'frozen', False):
                    cmd_osd = [sys.executable, "--osd", viewer]
                else:
                    cmd_osd = [sys.executable, sys.argv[0], "--osd", viewer]
                osd_process = subprocess.Popen(cmd_osd)
            except: pass

        log_event(f"IPC: Iniciando Captura de Tela M:{monitor_idx}, Q:{quality}", "INFO")
        current_stream_id += 1
        desktop_streaming = True
        threading.Thread(target=stream_screen, args=(monitor_idx, quality, current_stream_id), daemon=True).start()

    elif cmd == "stop_desktop":
        log_event("IPC: Parando captura de tela", "INFO")
        desktop_streaming = False
        current_stream_id += 1
        try:
            if osd_process and osd_process.poll() is None:
                osd_process.kill()
                osd_process = None
        except: pass

    elif cmd == "mouse_move":
         if not desktop_streaming: return
         try:
            mon = cached_monitor_geometry
            target_x = mon["left"] + (data.get("x", 0) / data.get("width", mon["width"])) * mon["width"]
            target_y = mon["top"] + (data.get("y", 0) / data.get("height", mon["height"])) * mon["height"]
            pyautogui.moveTo(target_x, target_y)
         except: pass

    elif cmd == "mouse_down":
         if not desktop_streaming: return
         try:
            mon = cached_monitor_geometry
            target_x = mon["left"] + (data.get("x", 0) / data.get("width", mon["width"])) * mon["width"]
            target_y = mon["top"] + (data.get("y", 0) / data.get("height", mon["height"])) * mon["height"]
            pyautogui.mouseDown(x=target_x, y=target_y, button=data.get("button", "left"))
         except: pass

    elif cmd == "mouse_up":
         if not desktop_streaming: return
         try:
            mon = cached_monitor_geometry
            target_x = mon["left"] + (data.get("x", 0) / data.get("width", mon["width"])) * mon["width"]
            target_y = mon["top"] + (data.get("y", 0) / data.get("height", mon["height"])) * mon["height"]
            pyautogui.mouseUp(x=target_x, y=target_y, button=data.get("button", "left"))
         except: pass

    elif cmd == "mouse_scroll":
         if not desktop_streaming: return
         try:
            # e.deltaY > 0 in browser means scroll down -> clicks positive.
            # pyautogui requires negative value to scroll down.
            scroll_amount = int(data.get("clicks", 0)) * -120
            pyautogui.scroll(scroll_amount)
         except: pass

    elif cmd == "key_down":
         if not desktop_streaming: return
         try:
            key_map = {'ArrowDown': 'down', 'ArrowUp': 'up', 'ArrowLeft': 'left', 'ArrowRight': 'right', 'Enter': 'enter', 'Escape': 'esc', 'Backspace': 'backspace', 'Tab': 'tab', 'Delete':'delete', ' ': 'space'}
            raw_key = data.get("key", "")
            py_key = key_map.get(raw_key, raw_key.lower())
            pyautogui.press(py_key)
         except: pass

    elif cmd == "get_monitors":
         try:
            with mss.mss() as sct:
                monitors_info = [{"index": i, "name": "Todas as Telas" if i==0 else f"Monitor {i}", "width": m["width"], "height": m["height"]} for i, m in enumerate(sct.monitors)]
                push_to_core("monitor_list", {"monitors": monitors_info})
         except: pass


def get_pipe_acl():
    sd = win32security.SECURITY_DESCRIPTOR()
    dacl = win32security.ACL()
    sid_system = win32security.ConvertStringSidToSid("S-1-5-18")
    sid_admins = win32security.ConvertStringSidToSid("S-1-5-32-544")
    dacl.AddAccessAllowedAce(win32security.ACL_REVISION, win32con.GENERIC_ALL, sid_system)
    dacl.AddAccessAllowedAce(win32security.ACL_REVISION, win32con.GENERIC_ALL, sid_admins)
    sd.SetSecurityDescriptorDacl(1, dacl, 0)
    sa = win32security.SECURITY_ATTRIBUTES()
    sa.SECURITY_DESCRIPTOR = sd
    return sa

def ipc_listener_loop():
    sa = get_pipe_acl()
    
    while True:
        try:
            pipe = win32pipe.CreateNamedPipe(
                MY_IPC_PIPE,
                win32pipe.PIPE_ACCESS_DUPLEX,
                win32pipe.PIPE_TYPE_MESSAGE | win32pipe.PIPE_READMODE_MESSAGE | win32pipe.PIPE_WAIT,
                255, 65536, 65536,
                0,
                sa
            )
            try:
                win32pipe.ConnectNamedPipe(pipe, None)
                threading.Thread(target=handle_remote_ipc_client, args=(pipe,), daemon=True).start()
            except pywintypes.error as e:
                if e.winerror == 535: # ERROR_PIPE_CONNECTED
                    threading.Thread(target=handle_remote_ipc_client, args=(pipe,), daemon=True).start()
                elif e.winerror == 232: # ERROR_NO_DATA (Client disconnected before we could accept)
                    win32file.CloseHandle(pipe)
                else:
                    log_event(f"Erro Conectando ao IPC (Remote Pipe): {e}", "ERROR")
                    try: win32file.CloseHandle(pipe)
                    except: pass
                    time.sleep(1)
        except Exception as e:
            log_event(f"Erro Criando Servidor IPC (Remote Pipe): {e}", "ERROR")
            try: win32file.CloseHandle(pipe)
            except: pass
            time.sleep(1)

def handle_remote_ipc_client(pipe):
    try:
        # Leitura do comando do Core
        data = b""
        while True:
            resp, chunk = win32file.ReadFile(pipe, 4096)
            data += chunk
            if resp == 0: break
        
        payload = json.loads(data.decode('utf-8'))
        
        # VALIDAÇÃO DO TOKEN
        if payload.get("token") == IPC_TOKEN:
            execute_ipc_command(payload)
        else:
            log_event("BLOQUEADO: Tentativa de controle remoto sem token válido.", "WARNING")
            
    except Exception as e:
        log_event(f"Erro processando cliente IPC no Remote: {e}", "ERROR")
    finally:
        try: win32file.CloseHandle(pipe)
        except: pass

# =========================================================
# MAIN ENTRYPOINT
# =========================================================
if __name__ == "__main__":
    log_event("==== DOC-IT REMOTE MODULE INITIALIZED ====", "INFO")
    # Este módulo fica eternamente travado no loop de escuta de Socket 
    # Ate o Core matar o processo ou a máquina desligar.
    ipc_listener_loop()
