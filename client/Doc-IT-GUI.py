import os
import sys
import json
import time
import threading
from datetime import datetime
import customtkinter as ctk
import psutil
import pystray
import subprocess
from PIL import Image, ImageDraw, ImageTk
import win32api
import win32con
import win32security
from cryptography.fernet import Fernet

import socket
import win32pipe
import win32file
import pywintypes

# --- Constantes IPC ---
CORE_IPC_PIPE = r'\\.\pipe\DocIT_Core_IPC'

# Versão do Módulo GUI
GUI_VERSION = "2.1.3"
LOG_FILE = "agent-gui.log"

def log_event(message, level="INFO"):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_entry = f"{timestamp} [{level}] [GUI] - {message}\n"
    try:
        with open(LOG_FILE, "a", encoding='utf-8') as f:
            f.write(log_entry)
            
        if os.path.exists(LOG_FILE) and os.path.getsize(LOG_FILE) > 2 * 1024 * 1024:
            os.replace(LOG_FILE, LOG_FILE + ".bak")
    except:
        pass

def request_config_from_core():
    """Solicita a configuração ativa ao processo Core via Named Pipe com suporte a retries."""
    
    # Tenta até 5 vezes em caso de pipe ocupado ou erro temporário
    for attempt in range(5):
        handle = None
        try:
            # Se o pipe estiver ocupado, espera até 1 segundo
            try:
                win32pipe.WaitNamedPipe(CORE_IPC_PIPE, 1000)
            except:
                pass

            payload = {
                "action": "get_config",
            }
            
            handle = win32file.CreateFile(
                CORE_IPC_PIPE,
                win32file.GENERIC_READ | win32file.GENERIC_WRITE,
                0, None,
                win32file.OPEN_EXISTING,
                0, None
            )
            win32pipe.SetNamedPipeHandleState(handle, win32pipe.PIPE_READMODE_MESSAGE, None, None)
            win32file.WriteFile(handle, json.dumps(payload).encode('utf-8'))
            
            # Leitura da resposta
            data = b""
            while True:
                resp, chunk = win32file.ReadFile(handle, 4096)
                data += chunk
                if resp == 0: break
                
            response = json.loads(data.decode('utf-8'))
            if response.get("status") == "success":
                return response.get("config", {})
                
        except pywintypes.error as e:
            if e.winerror == 231: # Pipe is busy
                log_event(f"Pipe ocupado (Tentativa {attempt+1}/5). Aguardando...", "DEBUG")
                time.sleep(0.5)
                continue
            log_event(f"Falha ao solicitar config ao Core (Tentativa {attempt+1}/5): {e}", "WARNING")
        except Exception as e:
            log_event(f"Erro inesperado no IPC do GUI: {e}", "ERROR")
        finally:
            if handle:
                try: win32file.CloseHandle(handle)
                except: pass
        
        time.sleep(1) # Espera antes do próximo retry

    return None

def check_process_running(process_name):
    for proc in psutil.process_iter(['name']):
        try:
            if proc.info['name'] == process_name:
                return True
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            pass
    return False

def check_service_running(service_name):
    import win32serviceutil
    import win32service
    try:
        status = win32serviceutil.QueryServiceStatus(service_name)[1]
        return status == win32service.SERVICE_RUNNING
    except:
        return False

import ctypes
def get_file_version(path):
    """Lê a versão (ProductVersion) diretamente dos metadados do executável via API do Windows."""
    if not os.path.exists(path): return None
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
    except: pass
    return None

def get_local_gui_version():
    """Tenta ler a versão do próprio executável ou fallback."""
    if getattr(sys, 'frozen', False):
        v = get_file_version(sys.executable)
        if v: return v
    return "0.0.0"

# --- Classe Principal da Janela GUI ---
class DocITDashboard(ctk.CTk):
    def __init__(self):
        super().__init__()

        self.title("Doc-IT Agent - Painel de Controle")
        self.geometry("600x480")
        self.resizable(False, False)
        
        screen_width = self.winfo_screenwidth()
        screen_height = self.winfo_screenheight()
        x = (screen_width/2) - (600/2)
        y = (screen_height/2) - (480/2)
        self.geometry(f'+{int(x)}+{int(y)}')
        
        # --- Configura o Ícone da Barra de Tarefas (Taskbar) e Janela ---
        self.set_window_icon()

        self.protocol("WM_DELETE_WINDOW", self.hide_window)
        
        self.is_unlocked = False
        self.config_data = {}
        self.current_gui_version = get_local_gui_version()
        self.auto_lock_timer = None
        self.tray_icon = None
        
        self.setup_ui()
        
        # Puxa configuração inicial
        initial_cfg = request_config_from_core()
        if initial_cfg:
            self.config_data = initial_cfg
            self.refresh_tamper_ui()
            
        self.update_status_loop()

    def set_window_icon(self):
        try:
            if hasattr(sys, '_MEIPASS'):
                base_path = sys._MEIPASS
            else:
                base_path = os.path.dirname(__file__)
            
            ico_path = os.path.join(base_path, "assets", "icon.ico")
            logo_path = os.path.join(base_path, "assets", "logo-ico-azul.ico") # Símbolo limpo
            
            import ctypes
            myappid = u'docit.agent.gui.v2'
            ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(myappid)
            
            # Tenta setar nativo (pode falhar e ficar em branco com ICOs modernos comprimidos)
            if os.path.exists(ico_path):
                try:
                    self.iconbitmap(ico_path)
                except:
                    pass
                
            # Fallback INFALÍVEL via Pillow (Garante que a barra de tarefas não fique em branco)
            icon_src = ico_path if os.path.exists(ico_path) else logo_path
            if os.path.exists(icon_src):
                img = Image.open(icon_src).convert("RGBA")
                self.after(200, lambda: self.wm_iconphoto(True, ImageTk.PhotoImage(img)))
        except Exception as e:
            log_event(f"Erro ao setar ícone da janela: {e}", "WARNING")

    def hide_window(self):
        self.withdraw()

    def setup_ui(self):
        # Header
        self.header_frame = ctk.CTkFrame(self, fg_color="#1f538d", corner_radius=0)
        self.header_frame.pack(fill="x")
        
        try:
            if hasattr(sys, '_MEIPASS'):
                base_path = sys._MEIPASS
            else:
                base_path = os.path.dirname(__file__)
            logo_path = os.path.join(base_path, "assets", "logo.png")
            if os.path.exists(logo_path):
                logo_img = ctk.CTkImage(light_image=Image.open(logo_path), 
                                       dark_image=Image.open(logo_path), 
                                       size=(50, 50)) # Aumentado de 40 para 50
                self.logo_label = ctk.CTkLabel(self.header_frame, image=logo_img, text="")
                self.logo_label.pack(side="left", padx=20, pady=10)
        except Exception as e:
            log_event(f"Erro ao carregar logo no header: {e}", "WARNING")

        self.title_label = ctk.CTkLabel(self.header_frame, text="Doc-IT Endpoint Agent", font=ctk.CTkFont(size=20, weight="bold"), text_color="white")
        self.title_label.pack(side="left", pady=10)

        # Tabview para dividir Status e Configurações
        self.tabview = ctk.CTkTabview(self, width=560, height=360)
        self.tabview.pack(padx=20, pady=10, fill="both", expand=True)
        
        self.tab_status = self.tabview.add("Estado do Sistema")
        self.tab_config = self.tabview.add("Configurações")
        
        # === ABA: ESTADO DO SISTEMA ===
        self.status_frame = ctk.CTkFrame(self.tab_status)
        self.status_frame.pack(side="left", fill="both", expand=True, padx=(0,5))
        
        ctk.CTkLabel(self.status_frame, text="Módulos Locais", font=ctk.CTkFont(size=14, weight="bold")).pack(pady=10)

        self.lbl_core = ctk.CTkLabel(self.status_frame, text="Core Service: Verificando...")
        self.lbl_core.pack(anchor="w", padx=20, pady=5)
        
        self.lbl_remote = ctk.CTkLabel(self.status_frame, text="Remote Desktop: Verificando...")
        self.lbl_remote.pack(anchor="w", padx=20, pady=5)

        self.lbl_inventory = ctk.CTkLabel(self.status_frame, text="Inventory: Verificando...")
        self.lbl_inventory.pack(anchor="w", padx=20, pady=5)
        
        self.lbl_updater = ctk.CTkLabel(self.status_frame, text="Updater: Verificando...")
        self.lbl_updater.pack(anchor="w", padx=20, pady=5)

        self.lbl_osquery = ctk.CTkLabel(self.status_frame, text="Osquery Engine: Verificando...")
        self.lbl_osquery.pack(anchor="w", padx=20, pady=5)

        self.actions_frame = ctk.CTkFrame(self.tab_status)
        self.actions_frame.pack(side="right", fill="both", expand=True, padx=(5,0))

        ctk.CTkLabel(self.actions_frame, text="Tamper Protection", font=ctk.CTkFont(size=14, weight="bold")).pack(pady=10)

        self.tamper_frame = ctk.CTkFrame(self.actions_frame, fg_color="transparent")
        self.tamper_frame.pack(pady=10, fill="x")
        
        self.lbl_tamper = ctk.CTkLabel(self.tamper_frame, text="Aguardando Core...", text_color="gray")
        self.lbl_tamper.pack(pady=5)
        
        self.entry_password = ctk.CTkEntry(self.tamper_frame, placeholder_text="Senha Tamper (OTP)", show="*")
        self.btn_unlock = ctk.CTkButton(self.tamper_frame, text="Desbloquear Ações", command=self.unlock_actions)

        self.btn_restart = ctk.CTkButton(self.actions_frame, text="Reiniciar Agente", fg_color="#1f538d", command=self.restart_agent)
        self.btn_force_sync = ctk.CTkButton(self.actions_frame, text="Sincronizar Inventário", fg_color="#1f538d", command=self.force_sync)
        self.btn_lock = ctk.CTkButton(self.actions_frame, text="Bloquear Painel", fg_color="#dc3545", hover_color="#c82333", command=self.lock_actions)

        self.lbl_server = ctk.CTkLabel(self.actions_frame, text="Servidor: ...", font=ctk.CTkFont(size=10), text_color="gray")
        self.lbl_server.pack(side="bottom", pady=5)
        
        # === ABA: CONFIGURAÇÕES ===
        ctk.CTkLabel(self.tab_config, text="Ajustes de Telemetria e Conexão", font=ctk.CTkFont(size=16, weight="bold")).pack(pady=10)
        
        self.cfg_frame = ctk.CTkFrame(self.tab_config, fg_color="transparent")
        self.cfg_frame.pack(fill="both", expand=True, padx=20)
        
        ctk.CTkLabel(self.cfg_frame, text="Servidor Base URL:").grid(row=0, column=0, sticky="w", pady=(10,0))
        self.input_base_url = ctk.CTkEntry(self.cfg_frame, width=300)
        self.input_base_url.grid(row=1, column=0, sticky="w", pady=(0,10))
        
        ctk.CTkLabel(self.cfg_frame, text="Nível de Log Global:").grid(row=2, column=0, sticky="w", pady=(10,0))
        self.combo_log = ctk.CTkComboBox(self.cfg_frame, values=["INFO", "DEBUG", "WARNING", "CRITICAL"])
        self.combo_log.grid(row=3, column=0, sticky="w", pady=(0,10))
        
        ctk.CTkLabel(self.cfg_frame, text="Intervalo de Update (min):").grid(row=4, column=0, sticky="w", pady=(10,0))
        self.input_update_interval = ctk.CTkEntry(self.cfg_frame, width=100)
        self.input_update_interval.grid(row=5, column=0, sticky="w", pady=(0,10))
        
        self.btn_save_cfg = ctk.CTkButton(self.tab_config, text="Salvar Alterações e Reiniciar", fg_color="#28a745", hover_color="#218838", command=self.save_settings)
        # Oculto por padrão (até destravar)
        self.lbl_cfg_locked = ctk.CTkLabel(self.tab_config, text="🔒 Desbloqueie o Painel na aba de Status para editar as configurações.", text_color="#dc3545")
        self.lbl_cfg_locked.pack(pady=20)

    def save_settings(self):
        if not self.is_unlocked: return
        try:
            payload = {
                "action": "save_config",
                "tamper_auth": self.entry_password.get().strip() if self.config_data.get("tamper_enabled") else None,
                "config": {
                    "server_base_url": self.input_base_url.get(),
                    "log_level": self.combo_log.get(),
                    "update_check_interval_minutes": self.input_update_interval.get()
                }
            }
            handle = win32file.CreateFile(CORE_IPC_PIPE, win32file.GENERIC_READ | win32file.GENERIC_WRITE, 0, None, win32file.OPEN_EXISTING, 0, None)
            win32pipe.SetNamedPipeHandleState(handle, win32pipe.PIPE_READMODE_MESSAGE, None, None)
            win32file.WriteFile(handle, json.dumps(payload).encode('utf-8'))
            
            data = b""
            while True:
                resp, chunk = win32file.ReadFile(handle, 4096)
                data += chunk
                if resp == 0: break
            win32file.CloseHandle(handle)
            res = json.loads(data.decode('utf-8'))
            if res.get("status") == "success":
                self.lbl_cfg_locked.configure(text="✅ Configuração Salva! Reiniciando agente...", text_color="#28a745")
                self.lbl_cfg_locked.pack(pady=20)
                self.restart_agent()
        except Exception as e:
            log_event(f"Falha ao enviar save_config: {e}", "ERROR")
        finally:
            try: win32file.CloseHandle(handle)
            except: pass

    def refresh_tamper_ui(self):
        tamper_enabled = self.config_data.get("tamper_enabled", True)
        srv = self.config_data.get("server_base_url", "Desconhecido")
        self.lbl_server.configure(text=f"Servidor: {srv}")
        
        # Popula inputs da aba config
        if not self.input_base_url.get():
            self.input_base_url.delete(0, 'end')
            self.input_base_url.insert(0, srv)
            self.combo_log.set(self.config_data.get("log_level", "INFO"))
            self.input_update_interval.delete(0, 'end')
            self.input_update_interval.insert(0, str(self.config_data.get("update_check_interval_minutes", 60)))

        if tamper_enabled:
            if not self.is_unlocked:
                self.lbl_tamper.configure(text="🔒 Proteção de Agente Ativa", text_color="#dc3545", font=ctk.CTkFont(weight="bold"))
                self.entry_password.pack(pady=5, padx=20, fill="x")
                self.btn_unlock.pack(pady=5, padx=20, fill="x")
        else:
            self.lbl_tamper.configure(text="🔓 Proteção de Agente Inativa", text_color="#28a745", font=ctk.CTkFont(weight="bold"))
            self.entry_password.pack_forget()
            self.btn_unlock.pack_forget()
            self.unlock_actions(bypass=True)

    def unlock_actions(self, bypass=False):
        if not bypass:
            typed_pass = self.entry_password.get().strip()
            real_pass = self.config_data.get("tamper_password")
            
            if typed_pass != real_pass: 
                self.lbl_tamper.configure(text="❌ Senha Incorreta", text_color="#dc3545")
                return

        self.is_unlocked = True
        
        if hasattr(self, 'lbl_tamper') and not bypass:
            self.lbl_tamper.configure(text="🔓 Acesso Temporário Liberado", text_color="#28a745")
            self.entry_password.configure(state="disabled")
            self.btn_unlock.configure(state="disabled")

        self.btn_restart.pack(pady=10, padx=20, fill="x")
        self.btn_force_sync.pack(pady=10, padx=20, fill="x")
        self.btn_lock.pack(pady=10, padx=20, fill="x")
        
        # Libera controles da aba de configuração
        self.lbl_cfg_locked.pack_forget()
        self.btn_save_cfg.pack(pady=20, side="bottom")
        self.btn_force_sync.pack(pady=10, padx=20, fill="x")
        self.btn_lock.pack(pady=10, padx=20, fill="x")
        
        if not bypass:
            if self.auto_lock_timer:
                self.after_cancel(self.auto_lock_timer)
            self.auto_lock_timer = self.after(3600000, lambda: self.lock_actions(auto=True))

    def lock_actions(self, auto=False):
        if not self.is_unlocked: return
        
        self.is_unlocked = False
        if self.auto_lock_timer:
            self.after_cancel(self.auto_lock_timer)
            self.auto_lock_timer = None

        self.btn_restart.pack_forget()
        self.btn_force_sync.pack_forget()
        self.btn_lock.pack_forget()

        if hasattr(self, 'lbl_tamper'):
            msg = "🔒 Painel Bloqueado (Auto-Lock 1h)" if auto else "🔒 Proteção de Agente Ativa"
            self.lbl_tamper.configure(text=msg, text_color="#dc3545")
            self.entry_password.configure(state="normal")
            self.entry_password.delete(0, 'end')
            self.btn_unlock.configure(state="normal")
            log_event(f"Acesso Administrativo da GUI foi revogado/bloqueado. (Auto-Lock: {auto})", "INFO")

    def update_status_loop(self):
        threading.Thread(target=self._check_status_worker, daemon=True).start()
        self.after(5000, self.update_status_loop)

    def _check_status_worker(self):
        core_running = check_service_running("DocITAgent") or check_process_running("Doc-IT-Core.exe")
        remote_running = check_process_running("Doc-IT-Remote.exe")
        inv_running = check_process_running("Doc-IT-Inventory.exe")
        updater_running = check_process_running("Doc-IT-Updater.exe")
        
        # Puxa a configuração fresquinha do Core se ele estiver rodando (correção v2.0.25)
        if core_running:
            new_cfg = request_config_from_core()
            if new_cfg is not None:
                self.config_data = new_cfg
        
        # Define o diretório base dinamicamente para ler as versões
        base_dir = os.path.dirname(sys.executable) if getattr(sys, 'frozen', False) else os.path.dirname(os.path.abspath(__file__))
        
        # Coleta a versão dos submódulos
        core_ver = get_file_version(os.path.join(base_dir, "Doc-IT-Core.exe")) or "Desconhecido"
        remote_ver = get_file_version(os.path.join(base_dir, "Doc-IT-Remote.exe")) or "Desconhecido"
        inv_ver = get_file_version(os.path.join(base_dir, "Doc-IT-Inventory.exe")) or "Desconhecido"
        updater_ver = get_file_version(os.path.join(base_dir, "Doc-IT-Updater.exe")) or "Desconhecido"

        # Busca versão do osquery via binário local
        try:
            exe_osq = os.path.join(base_dir, "assets", "bin", "osqueryi.exe")
            if os.path.exists(exe_osq):
                output = subprocess.check_output([exe_osq, "--version"], text=True, creationflags=subprocess.CREATE_NO_WINDOW)
                parts = output.strip().split(" ")
                osq_ver = parts[2] if len(parts) > 2 else parts[1]
            else:
                osq_ver = "Não Instalado"
        except:
            osq_ver = "Erro"

        self.after(0, self._apply_status_ui, core_running, remote_running, inv_running, updater_running, core_ver, remote_ver, inv_ver, updater_ver, osq_ver)

    def _apply_status_ui(self, core, remote, inv, updater, core_ver, remote_ver, inv_ver, updater_ver, osq_ver):
        self.lbl_core.configure(text=f"Core Service: {'🟢 v' + core_ver if core else '🔴 Parado'}")
        self.lbl_remote.configure(text=f"Remote Desktop: {'🟢 v' + remote_ver if remote else '🔴 Parado'}")
        self.lbl_inventory.configure(text=f"Inventory: {'🟢 v' + inv_ver if inv else '🔴 Parado'}")
        self.lbl_updater.configure(text=f"Updater: {'🟢 v' + updater_ver if updater else '🔴 Parado'}")
        self.lbl_osquery.configure(text=f"Osquery Engine: {'🟢 v' + osq_ver if osq_ver != 'Não Instalado' and osq_ver != 'Erro' else '🟡 ' + osq_ver}")
        
        # Atualiza a UI do Tamper se recebemos config
        if self.config_data:
            self.refresh_tamper_ui()

    def restart_agent(self):
        if not self.is_unlocked: return
        log_event("Usuário local solicitou reinicialização do Serviço CORE via IPC.", "WARNING")
        try:
            payload = {
                "action": "restart_request",
                "data": "user_ui_request"
            }
            handle = win32file.CreateFile(CORE_IPC_PIPE, win32file.GENERIC_READ | win32file.GENERIC_WRITE, 0, None, win32file.OPEN_EXISTING, 0, None)
            win32pipe.SetNamedPipeHandleState(handle, win32pipe.PIPE_READMODE_MESSAGE, None, None)
            win32file.WriteFile(handle, json.dumps(payload).encode('utf-8'))
            win32file.CloseHandle(handle)
            self.lbl_tamper.configure(text="✅ Reiniciando em 5-10s...")
        except Exception as e:
            log_event(f"Falha ao enviar restart_request via IPC: {e}", "ERROR")
            self.lbl_tamper.configure(text="❌ Erro IPC na Reinicialização")
        finally:
            try: win32file.CloseHandle(handle)
            except: pass
            
    def force_sync(self):
        if not self.is_unlocked: return
        log_event("Usuário local solicitou sincronização forçada via GUI.", "INFO")
        try:
            for proc in psutil.process_iter(['name']):
                if proc.info['name'] == 'Doc-IT-Inventory.exe':
                    proc.kill()
            self.lbl_tamper.configure(text="✅ Sincronização em Background")
        except:
            pass

# --- Bandeja do Sistema (Tray Icon) ---

def on_quit_clicked(icon, item):
    icon.stop()
    os._exit(0)

def on_show_clicked(icon, item):
    if app_instance:
        app_instance.after(0, app_instance.deiconify)
        app_instance.after(0, app_instance.lift)

def create_image(width, height):
    image = Image.new('RGB', (width, height), color=(31, 83, 141))
    dc = ImageDraw.Draw(image)
    dc.rectangle((width // 2, 0, width, height // 2), fill=(40, 167, 69))
    dc.rectangle((0, height // 2, width // 2, height), fill=(40, 167, 69))
    return image

app_instance = None

def setup_tray():
    icon_image = create_image(64, 64)
    if hasattr(sys, '_MEIPASS'):
        base_path = sys._MEIPASS
    else:
        base_path = os.path.dirname(__file__)
    logo_path = os.path.join(base_path, "assets", "logo-png-azul.png")
    ico_path = os.path.join(base_path, "assets", "icon.ico")
    simplified_path = os.path.join(base_path, "assets", "logo-ico-azul.ico")
    
    # Prioridade pro ícone simplificado na bandeja (maior legibilidade 16x16)
    found_image = False
    for path in [simplified_path, ico_path, logo_path]:
        if os.path.exists(path):
            try:
                img = Image.open(path).convert("RGBA")
                
                # CORTA BORDAS TRANSPARENTES PARA MAXIMIZAR O TAMANHO NA BANDEJA
                bbox = img.getbbox()
                if bbox:
                    img = img.crop(bbox)
                
                # Deixa quadrado de novo para o pystray não distorcer
                w, h = img.size
                size = max(w, h)
                new_img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
                new_img.paste(img, ((size - w) // 2, (size - h) // 2))
                
                icon_image = new_img
                found_image = True
                break
            except Exception as e:
                log_event(f"Falha ao carregar ícone {path}: {e}", "WARNING")
    
    if not found_image:
        icon_image = create_image(64, 64)

    menu = pystray.Menu(
        pystray.MenuItem('Abrir Painel Admin', on_show_clicked, default=True),
        pystray.MenuItem('Sair da Interface (GUI)', on_quit_clicked)
    )
    
    icon = pystray.Icon("Doc-IT", icon_image, "Doc-IT Endpoint Agent", menu)
    # run_detached não bloqueia a thread, permitindo que o mainloop do Tkinter rode na principal
    icon.run_detached()
    return icon

if __name__ == "__main__":
    try:
        import win32event
        import win32api
        import winerror
        mutex = win32event.CreateMutex(None, 1, "DocITAgent_GUI_Mutex")
        if win32api.GetLastError() == winerror.ERROR_ALREADY_EXISTS:
            os._exit(0)
    except:
        pass

    app_instance = DocITDashboard()
    
    if len(sys.argv) > 1 and sys.argv[1] == "--show":
        pass
    else:
        app_instance.withdraw()

    # Inicia a Tray de forma Detached (Estável no Windows)
    app_instance.tray_icon = setup_tray()
    
    try:
        app_instance.mainloop()
    except KeyboardInterrupt:
        pass
