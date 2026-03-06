import os
import sys
import shutil
import time
import subprocess
import ctypes
import threading
import tkinter as tk
from tkinter import ttk, messagebox
import psutil
import winreg

def kill_agent_processes():
    target_exes = ["Doc-IT-Core.exe", "Doc-IT-Inventory.exe", "Doc-IT-Remote.exe", "Doc-IT-Updater.exe", "Doc-IT-GUI.exe"]
    try:
        for proc in psutil.process_iter(['name']):
            try:
                if proc.info['name'] in target_exes:
                    proc.kill()
            except:
                pass
    except:
        pass

def is_admin():
    try: return ctypes.windll.shell32.IsUserAnAdmin()
    except: return False

def run_as_admin():
    ctypes.windll.shell32.ShellExecuteW(None, "runas", sys.executable, " ".join(sys.argv), None, 1)

class InstallerGUI(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Doc-IT Agent Setup")
        self.geometry("400x250")
        self.resizable(False, False)
        self.eval('tk::PlaceWindow . center')
        
        self.configure(bg="#1e1e2e")
        
        self.style = ttk.Style(self)
        self.style.theme_use('clam')
        self.style.configure("TLabel", background="#1e1e2e", foreground="#cdd6f4", font=("Segoe UI", 10))
        self.style.configure("Title.TLabel", font=("Segoe UI", 14, "bold"))
        self.style.configure("TProgressbar", thickness=15, troughcolor="#313244", background="#89b4fa")
        self.style.configure("TButton", font=("Segoe UI", 10, "bold"), background="#89b4fa", foreground="#11111b")
        self.style.map("TButton", background=[("active", "#b4befe")])

        self.lbl_title = ttk.Label(self, text="Instalador do Agente Doc-IT", style="Title.TLabel")
        self.lbl_title.pack(pady=15)
        
        self.lbl_status = ttk.Label(self, text="Pronto para instalar.")
        self.lbl_status.pack(pady=5)
        
        self.progress = ttk.Progressbar(self, orient=tk.HORIZONTAL, length=300, mode='determinate')
        self.progress.pack(pady=10)
        
        self.btn_action = ttk.Button(self, text="Instalar", command=self.start_installation)
        self.btn_action.pack(pady=5)
        
        self.target_dir = r"C:\Program Files\Doc-IT Agent"
        if os.path.exists(self.target_dir):
            self.lbl_status.config(text="Agente já instalado. Escolha a ação:")
            self.btn_action.config(text="Atualizar / Reinstalar")
            
            self.btn_uninstall = ttk.Button(self, text="Desinstalar Completamente", command=self.start_uninstallation)
            self.btn_uninstall.pack(pady=5)
        
    def log(self, text, value):
        self.lbl_status.config(text=text)
        self.progress['value'] = value
        self.update()

    def start_installation(self):
        self.btn_action.config(state="disabled")
        if hasattr(self, 'btn_uninstall'): self.btn_uninstall.config(state="disabled")
        threading.Thread(target=self.install_process, daemon=True).start()

    def start_uninstallation(self):
        self.btn_action.config(state="disabled")
        self.btn_uninstall.config(state="disabled")
        threading.Thread(target=self.uninstall_process, daemon=True).start()

    def uninstall_process(self):
        try:
            self.log("Parando Windows Service...", 20)
            subprocess.run(["net", "stop", "DocITAgent"], capture_output=True, creationflags=subprocess.CREATE_NO_WINDOW)
            time.sleep(2)

            self.log("Removendo Windows Service...", 40)
            core_path = os.path.join(self.target_dir, "Doc-IT-Core.exe")
            if os.path.exists(core_path):
                subprocess.run([core_path, "remove"], capture_output=True, creationflags=subprocess.CREATE_NO_WINDOW)
            time.sleep(2)

            self.log("Limpando processos residuais nativamente...", 60)
            kill_agent_processes()
            time.sleep(2)
            
            self.log("Limpando chaves de inicialização...", 70)
            try:
                key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Run", 0, winreg.KEY_ALL_ACCESS)
                winreg.DeleteValue(key, "DocITAgentGUI")
                winreg.CloseKey(key)
            except:
                pass

            self.log("Apagando arquivos...", 80)
            if os.path.exists(self.target_dir):
                shutil.rmtree(self.target_dir, ignore_errors=True)

            self.log("Agente Removido com Sucesso!", 100)
            messagebox.showinfo("Doc-IT Setup", "Agente e serviços removidos com sucesso da sua máquina.")
            self.btn_action.config(text="Sair", command=self.destroy, state="normal")
            
        except Exception as e:
            self.log(f"Erro ao desinstalar: {e}", 0)
            messagebox.showerror("Doc-IT Setup", f"Ocorreu um erro durante a desinstalação: {str(e)}")
            self.btn_action.config(text="Sair", command=self.destroy, state="normal")

    def install_process(self):
        try:
            self.log("Parando serviços existentes...", 10)
            subprocess.run(["net", "stop", "DocITAgent"], capture_output=True, creationflags=subprocess.CREATE_NO_WINDOW)
            time.sleep(2)
            
            # Matando processos residuais que poderiam travar a cópia
            kill_agent_processes()
            time.sleep(1)

            self.log("Preparando pasta de destino...", 30)
            if not os.path.exists(self.target_dir):
                os.makedirs(self.target_dir)

            self.log("Descompactando binários...", 50)
            meipass = getattr(sys, '_MEIPASS', os.path.abspath(os.path.dirname(__file__)))
            
            files_to_copy = [
                "Doc-IT-Core.exe", 
                "Doc-IT-Inventory.exe", 
                "Doc-IT-Remote.exe", 
                "Doc-IT-Updater.exe",
                "Doc-IT-GUI.exe"]
            
            for file in files_to_copy:
                src = os.path.join(meipass, file)
                if os.path.exists(src):
                    shutil.copy2(src, os.path.join(self.target_dir, file))
                    
            self.log("Importando configurações e certificados embarcados...", 70)
            embedded_config = os.path.join(meipass, "config.json")
            if os.path.exists(embedded_config):
                shutil.copy2(embedded_config, os.path.join(self.target_dir, "config.json"))
            
            embedded_certs = os.path.join(meipass, "certs")
            target_certs = os.path.join(self.target_dir, "certs")
            if os.path.exists(embedded_certs):
                if os.path.exists(target_certs):
                    shutil.rmtree(target_certs)
                shutil.copytree(embedded_certs, target_certs)

            self.log("Registrando o Serviço do Windows...", 85)
            core_path = os.path.join(self.target_dir, "Doc-IT-Core.exe")
            # Instalar serviço via pywin32 module arguments
            subprocess.run([core_path, "install"], capture_output=True, creationflags=subprocess.CREATE_NO_WINDOW)
            time.sleep(2)
            
            self.log("Configurando o Serviço (Auto-Start e Recovery)...", 90)
            subprocess.run(["sc", "config", "DocITAgent", "start=", "auto"], capture_output=True, creationflags=subprocess.CREATE_NO_WINDOW)
            subprocess.run(["sc", "failure", "DocITAgent", "reset=", "0", "actions=", "restart/5000/restart/5000/restart/10000"], capture_output=True, creationflags=subprocess.CREATE_NO_WINDOW)
            time.sleep(1)
            
            self.log("Iniciando Agente no Background...", 95)
            subprocess.run(["net", "start", "DocITAgent"], capture_output=True, creationflags=subprocess.CREATE_NO_WINDOW)
            
            self.log("Registrando GUI na Inicialização do Windows...", 98)
            try:
                key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Run", 0, winreg.KEY_ALL_ACCESS)
                gui_path = os.path.join(self.target_dir, "Doc-IT-GUI.exe")
                winreg.SetValueEx(key, "DocITAgentGUI", 0, winreg.REG_SZ, f'"{gui_path}" --hide')
                winreg.CloseKey(key)
                
                # Inicia a interface silenciosamente pro usuário logado logo no final da instalação.
                subprocess.Popen([gui_path, "--hide"], creationflags=subprocess.CREATE_NO_WINDOW)
            except Exception as reg_e:
                print(f"Aviso Setup GUI Registry: {reg_e}")
            
            self.log("Instalação Concluída com Sucesso!", 100)
            self.btn_action.config(text="Fechar", command=self.destroy, state="normal")
            
        except Exception as e:
            self.log(f"Erro Crítico: {e}", 0)
            messagebox.showerror("Doc-IT Setup", f"Erro fatal durante instalação: {str(e)}")
            self.btn_action.config(text="Sair", command=self.destroy, state="normal")

if __name__ == "__main__":
    if not is_admin():
        run_as_admin()
        sys.exit(0)
    
    app = InstallerGUI()

    if "--silent" in sys.argv:
        app.withdraw() # Esconde a interface
        app.install_process()
        sys.exit(0)
    
    app.mainloop()
