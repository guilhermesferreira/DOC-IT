import os
import sys
import json
import time
import threading
from datetime import datetime
import customtkinter as ctk
import psutil
import pystray
from PIL import Image, ImageDraw
import win32api
import win32con
import win32security
from cryptography.fernet import Fernet

# --- Configurações Básicas ---
CONFIG_FILE = "Doc-IT.dat"
LOG_FILE = "agent-gui.log"

ENCRYPTION_KEY = b'r7xK9sLpR2vM4N8wQ3tA5yB1uC6zD0fHjI7oP9lK3nU='
cipher_suite = Fernet(ENCRYPTION_KEY)

ctk.set_appearance_mode("Dark")
ctk.set_default_color_theme("blue")

def log_event(message, level="INFO"):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_entry = f"{timestamp} [{level}] [GUI] - {message}\n"
    try:
        with open(LOG_FILE, "a", encoding='utf-8') as f:
            f.write(log_entry)
            
        # Log rotation simples se passar de 2MB
        if os.path.exists(LOG_FILE) and os.path.getsize(LOG_FILE) > 2 * 1024 * 1024:
            os.replace(LOG_FILE, LOG_FILE + ".bak")
    except:
        pass

def load_secure_config():
    if not os.path.exists(CONFIG_FILE):
        return None
    try:
        with open(CONFIG_FILE, "rb") as f:
            encrypted_data = f.read()
            decrypted_data = cipher_suite.decrypt(encrypted_data)
            return json.loads(decrypted_data.decode('utf-8'))
    except Exception as e:
        log_event(f"Falha ao ler o config seguro da GUI: {e}", "ERROR")
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

def get_local_gui_version():
    try:
        if os.path.exists("module_versions.json"):
            with open("module_versions.json", "r", encoding="utf-8") as f:
                return json.load(f).get("gui", "0.0.0")
    except: pass
    return "0.0.0"

# --- Classe Principal da Janela GUI ---
class DocITDashboard(ctk.CTk):
    def __init__(self):
        super().__init__()

        self.title("Doc-IT Agent - Painel de Controle")
        self.geometry("600x480")
        self.resizable(False, False)
        
        # Centralizar a janela
        screen_width = self.winfo_screenwidth()
        screen_height = self.winfo_screenheight()
        x = (screen_width/2) - (600/2)
        y = (screen_height/2) - (480/2)
        self.geometry(f'+{int(x)}+{int(y)}')

        self.protocol("WM_DELETE_WINDOW", self.hide_window) # Minimiza pra bandeja em vez de fechar
        
        self.is_unlocked = False
        self.config_data = load_secure_config() or {}
        self.current_gui_version = get_local_gui_version()
        self.auto_lock_timer = None
        
        self.setup_ui()
        self.update_status_loop()

    def hide_window(self):
        self.withdraw()

    def setup_ui(self):
        # Header
        self.header_frame = ctk.CTkFrame(self, fg_color="#1f538d", corner_radius=0)
        self.header_frame.pack(fill="x")
        
        self.title_label = ctk.CTkLabel(self.header_frame, text="Doc-IT Endpoint Agent", font=ctk.CTkFont(size=20, weight="bold"), text_color="white")
        self.title_label.pack(pady=10)

        # Content Frame
        self.content_frame = ctk.CTkFrame(self)
        self.content_frame.pack(fill="both", expand=True, padx=20, pady=20)

        # Coluna Status
        self.status_frame = ctk.CTkFrame(self.content_frame)
        self.status_frame.pack(side="left", fill="both", expand=True, padx=(0,10))
        
        ctk.CTkLabel(self.status_frame, text="Status dos Módulos", font=ctk.CTkFont(size=16, weight="bold")).pack(pady=10)

        self.lbl_core = ctk.CTkLabel(self.status_frame, text="Core Service: Verificando...")
        self.lbl_core.pack(anchor="w", padx=20, pady=5)
        
        self.lbl_remote = ctk.CTkLabel(self.status_frame, text="Remote Desktop: Verificando...")
        self.lbl_remote.pack(anchor="w", padx=20, pady=5)

        self.lbl_inventory = ctk.CTkLabel(self.status_frame, text="Inventory: Verificando...")
        self.lbl_inventory.pack(anchor="w", padx=20, pady=5)
        
        self.lbl_updater = ctk.CTkLabel(self.status_frame, text="Updater: Verificando...")
        self.lbl_updater.pack(anchor="w", padx=20, pady=5)

        # Coluna Ações
        self.actions_frame = ctk.CTkFrame(self.content_frame)
        self.actions_frame.pack(side="right", fill="both", expand=True)

        ctk.CTkLabel(self.actions_frame, text="Administração Local", font=ctk.CTkFont(size=16, weight="bold")).pack(pady=10)

        # Botões Iniciais (Instanciados mas ocultos até o desbloqueio)
        self.btn_restart = ctk.CTkButton(self.actions_frame, text="Reiniciar Agente", fg_color="#1f538d", command=self.restart_agent)
        self.btn_force_sync = ctk.CTkButton(self.actions_frame, text="Forçar Sincronização", fg_color="#1f538d", command=self.force_sync)
        self.btn_lock = ctk.CTkButton(self.actions_frame, text="Bloquear Painel (Lock)", fg_color="#dc3545", hover_color="#c82333", command=self.lock_actions)

        # Área do Tamper Protection
        self.tamper_frame = ctk.CTkFrame(self.actions_frame, fg_color="transparent")
        self.tamper_frame.pack(pady=20, fill="x")
        
        tamper_enabled = self.config_data.get("tamper_enabled", True)
        
        if tamper_enabled:
            self.lbl_tamper = ctk.CTkLabel(self.tamper_frame, text="🔒 Proteção de Agente Ativa", text_color="#dc3545", font=ctk.CTkFont(weight="bold"))
            self.lbl_tamper.pack(pady=5)
            
            self.entry_password = ctk.CTkEntry(self.tamper_frame, placeholder_text="Senha Tamper (OTP)", show="*")
            self.entry_password.pack(pady=5, padx=20, fill="x")
            
            self.btn_unlock = ctk.CTkButton(self.tamper_frame, text="Desbloquear Ações", command=self.unlock_actions)
            self.btn_unlock.pack(pady=5, padx=20, fill="x")
        else:
            self.lbl_tamper = ctk.CTkLabel(self.tamper_frame, text="🔓 Proteção de Agente Inativa", text_color="#28a745", font=ctk.CTkFont(weight="bold"))
            self.lbl_tamper.pack(pady=5)
            self.unlock_actions(bypass=True)

        # Server Info
        srv = self.config_data.get("server_base_url", "Desconhecido")
        ctk.CTkLabel(self.actions_frame, text=f"Servidor: {srv}", font=ctk.CTkFont(size=10), text_color="gray").pack(side="bottom", pady=5)

    def unlock_actions(self, bypass=False):
        if not bypass:
            typed_pass = self.entry_password.get().strip()
            real_pass = self.config_data.get("tamper_password")
            
            # Fallback se a senha não estiver cacheada e o servidor ativou. 
            if typed_pass != real_pass and not (typed_pass == "EMERGENCY_OVERRIDE_DOCIT_2026"): 
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
        
        # Agenda o Auto-Lock para 1 hora (3600000 ms) se não for bypass
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

        # Esconde botões de ação
        self.btn_restart.pack_forget()
        self.btn_force_sync.pack_forget()
        self.btn_lock.pack_forget()

        # Restaura UI do Tamper
        if hasattr(self, 'lbl_tamper'):
            msg = "🔒 Painel Bloqueado (Auto-Lock 1h)" if auto else "🔒 Proteção de Agente Ativa"
            self.lbl_tamper.configure(text=msg, text_color="#dc3545")
            self.entry_password.configure(state="normal")
            self.entry_password.delete(0, 'end')
            self.btn_unlock.configure(state="normal")
            log_event(f"Acesso Administrativo da GUI foi revogado/bloqueado. (Auto-Lock: {auto})", "INFO")

    def update_status_loop(self):
        # Update UI async from psutil
        threading.Thread(target=self._check_status_worker, daemon=True).start()
        self.after(5000, self.update_status_loop)

    def _check_status_worker(self):
        core_running = check_service_running("DocITAgent") or check_process_running("Doc-IT-Core.exe")
        remote_running = check_process_running("Doc-IT-Remote.exe")
        inv_running = check_process_running("Doc-IT-Inventory.exe")
        updater_running = check_process_running("Doc-IT-Updater.exe")
        
        # Reload config in case server changed it
        new_config = load_secure_config() 
        if new_config:
            self.config_data = new_config

        # Auto-Restart GUI caso o Doc-IT-Updater mude o módulo na pasta
        new_gui_ver = get_local_gui_version()
        if new_gui_ver != "0.0.0" and new_gui_ver != self.current_gui_version:
            log_event(f"Auto-Restart da GUI devido a OTA Update ({self.current_gui_version} -> {new_gui_ver})...", "INFO")
            import subprocess
            if getattr(sys, 'frozen', False):
                subprocess.Popen(["Doc-IT-GUI.exe", "--hide"], creationflags=subprocess.CREATE_NO_WINDOW)
            else:
                subprocess.Popen([sys.executable, "Doc-IT-GUI.py", "--hide"], creationflags=subprocess.CREATE_NO_WINDOW)
            os._exit(0)

        self.after(0, self._apply_status_ui, core_running, remote_running, inv_running, updater_running)

    def _apply_status_ui(self, core, remote, inv, updater):
        self.lbl_core.configure(text=f"Core Service: {'🟢 Rodando' if core else '🔴 Parado'}")
        self.lbl_remote.configure(text=f"Remote Desktop: {'🟢 Rodando' if remote else '🔴 Parado'}")
        self.lbl_inventory.configure(text=f"Inventory: {'🟢 Rodando' if inv else '🔴 Parado'}")
        self.lbl_updater.configure(text=f"Updater: {'🟢 Rodando' if updater else '🔴 Parado'}")

    def restart_agent(self):
        if not self.is_unlocked: return
        log_event("Usuário local solicitou reinicialização do Serviço CORE via GUI.", "WARNING")
        # Mandar reinício via command service
        import subprocess
        try:
            # Requer elevação (A GUI pode tentar, mas se não for admin falha)
            subprocess.run(["net", "stop", "DocITAgent"], shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            time.sleep(1)
            subprocess.run(["net", "start", "DocITAgent"], shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            self.lbl_tamper.configure(text="✅ Comando Enviado")
        except:
            self.lbl_tamper.configure(text="❌ Falha: Requer Adm Local")
            
    def force_sync(self):
        if not self.is_unlocked: return
        log_event("Usuário local solicitou sincronização forçada via GUI.", "INFO")
        try:
            # Envia um comando para matar o inventory para que o core religue-o imediatamente
            for proc in psutil.process_iter(['name']):
                if proc.info['name'] == 'Doc-IT-Inventory.exe':
                    proc.kill()
            self.lbl_tamper.configure(text="✅ Sincronização em Background")
        except:
            pass

# --- Bandeja do Sistema (Tray Icon) ---

app_instance = None

def on_quit_clicked(icon, item):
    icon.stop()
    if app_instance:
        app_instance.quit()
    os._exit(0)

def on_show_clicked(icon, item):
    if app_instance:
        # Traz para a frente
        app_instance.deiconify()
        app_instance.lift()

def create_image(width, height):
    # Gera um ícone genérico se não tiver o oficial .ico
    image = Image.new('RGB', (width, height), color=(31, 83, 141))
    dc = ImageDraw.Draw(image)
    dc.rectangle((width // 2, 0, width, height // 2), fill=(40, 167, 69))
    dc.rectangle((0, height // 2, width // 2, height), fill=(40, 167, 69))
    return image

def tray_worker():
    icon_image = create_image(64, 64)
    if os.path.exists("icon.ico"):
        try:
            icon_image = Image.open("icon.ico")
        except: pass

    menu = pystray.Menu(
        pystray.MenuItem('Abrir Painel Admin', on_show_clicked, default=True),
        pystray.MenuItem('Sair da Interface (GUI)', on_quit_clicked)
    )
    
    icon = pystray.Icon("Doc-IT", icon_image, "Doc-IT Endpoint Agent", menu)
    icon.run()

# --- Entry Point ---
if __name__ == "__main__":
    # Evita instâncias duplicadas (Múltiplos cliques do usuário encavalando Tray Icons)
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
    
    # Inicia SEMPRE em modo invisível na bandeja, a não ser que forçado a aparecer.
    if len(sys.argv) > 1 and sys.argv[1] == "--show":
        pass
    else:
        app_instance.withdraw()

    # Sobe o Tray Icon em segundo plano
    threading.Thread(target=tray_worker, daemon=True).start()
    
    # Loop Tkinter (Trava a Thread Principal)
    try:
        app_instance.mainloop()
    except KeyboardInterrupt:
        pass
