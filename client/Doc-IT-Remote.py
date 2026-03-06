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
CORE_IPC_PORT = 49152 # Porta do Servidor Mestre (Core) 
MY_IPC_PORT = 49153   # Porta em que o Remote Escuta Comandos do Core

LOG_FILE = "agent-remote.log"
AGENT_VERSION = "2.0.7"

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
    """Envia um payload de resposta (ex: um frame jpg ou texto do cmd) de volta pro Core via TCP IPC"""
    try:
        client = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        client.settimeout(2)
        client.connect(('127.0.0.1', CORE_IPC_PORT))
        ipc_message = {
            "action": action,
            "data": data
        }
        client.sendall(json.dumps(ipc_message).encode('utf-8'))
        client.close()
    except Exception:
        pass # Ignora erros se o Pipe quebrar para nao vazar RAM

def stream_screen(monitor_idx, quality_profile, stream_id):
    """Laço infinito de captura de tela"""
    global desktop_streaming
    
    # Resolvendo resoluções dinamicamente
    if quality_profile == 'low': max_w, max_h = 854, 480; jpeg_quality = 30; sleep_time = 0.1
    elif quality_profile == 'high': max_w, max_h = 1920, 1080; jpeg_quality = 60; sleep_time = 0.05
    elif quality_profile == 'ultra': max_w, max_h = 3840, 2160; jpeg_quality = 80; sleep_time = 0.033
    else: max_w, max_h = 1280, 720; jpeg_quality = 40; sleep_time = 0.066

    try:
        with mss.mss() as sct:
            if monitor_idx >= len(sct.monitors): monitor_idx = 1
            monitor = sct.monitors[monitor_idx]
            
            while desktop_streaming and current_stream_id == stream_id:
                try:
                    sct_img = sct.grab(monitor)
                    img = Image.frombytes("RGB", sct_img.size, sct_img.bgra, "raw", "BGRX")
                    
                    if img.width > max_w or img.height > max_h:
                        img.thumbnail((max_w, max_h), Image.Resampling.LANCZOS)
                    
                    buffer = io.BytesIO()
                    img.save(buffer, format="JPEG", quality=jpeg_quality)
                    b64_img = base64.b64encode(buffer.getvalue()).decode('utf-8')
                    
                    # Push de frame pro Orquestrador (Core)
                    push_to_core("desktop_frame", {
                        "imageB64": b64_img,
                        "width": img.width,
                        "height": img.height
                    })
                    
                    time.sleep(sleep_time)
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
        monitor_idx = data.get("monitorIndex", 1)
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
            screen_w, screen_h = pyautogui.size()
            frame_w = data.get("width", screen_w)
            frame_h = data.get("height", screen_h)
            target_x = (data.get("x", 0) / frame_w) * screen_w
            target_y = (data.get("y", 0) / frame_h) * screen_h
            pyautogui.moveTo(target_x, target_y)
         except: pass

    elif cmd == "mouse_click":
         if not desktop_streaming: return
         try:
            screen_w, screen_h = pyautogui.size()
            target_x = (data.get("x", 0) / data.get("width", screen_w)) * screen_w
            target_y = (data.get("y", 0) / data.get("height", screen_h)) * screen_h
            pyautogui.click(x=target_x, y=target_y, button=data.get("button", "left"))
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


def ipc_listener_loop():
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        server.bind(('127.0.0.1', MY_IPC_PORT))
        server.listen(5)
        log_event(f"Módulo Remote aguardando Ordens do Core na porta {MY_IPC_PORT}...", "INFO")
    except Exception as e:
        log_event(f"Falha ao iniciar socket bind na porta {MY_IPC_PORT} (O processo é fantasma?): {e}", "CRITICAL")
        sys.exit(1)

    while True:
        try:
            client, _ = server.accept()
            # Trata requests curtos inline. Para arquivos grandes, usar threading
            data = client.recv(4096)
            if data:
                payload = json.loads(data.decode('utf-8'))
                execute_ipc_command(payload)
            client.close()
        except:
            pass

# =========================================================
# MAIN ENTRYPOINT
# =========================================================
if __name__ == "__main__":
    log_event("==== DOC-IT REMOTE MODULE INITIALIZED ====", "INFO")
    # Este módulo fica eternamente travado no loop de escuta de Socket 
    # Ate o Core matar o processo ou a máquina desligar.
    ipc_listener_loop()
