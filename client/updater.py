import os
import sys
import time
import subprocess
import shutil


def log(msg):
    with open("updater.log", "a") as f:
        f.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')} - {msg}\n")

if __name__ == "__main__":
    # Args: updater.exe <current_exe> <new_exe> [target_exe]
    # current_exe = nome do processo a matar (ex: agent.exe ou Doc-IT-agent.exe)
    # new_exe     = arquivo baixado (ex: agent_new.exe)
    # target_exe  = nome final desejado (ex: Doc-IT-agent.exe). Se omitido, usa current_exe.
    CURRENT_EXE = sys.argv[1] if len(sys.argv) > 1 else "agent.exe"
    NEW_EXE     = sys.argv[2] if len(sys.argv) > 2 else "agent_new.exe"
    TARGET_EXE  = sys.argv[3] if len(sys.argv) > 3 else CURRENT_EXE
    
    log(f"Iniciando processo de atualização. Atual: {CURRENT_EXE}, Novo: {NEW_EXE}, Alvo final: {TARGET_EXE}")
    
    # 1. Mata o agent antigo (pelo nome do processo atual)
    log(f"Forçando o encerramento de qualquer {CURRENT_EXE} pendente via Taskkill...")
    try:
        subprocess.run(["taskkill", "/F", "/IM", CURRENT_EXE], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception as e:
        log(f"Aviso no Taskkill: {e}")
    
    # Se o nome atual é diferente do alvo, também mata o alvo (caso já exista rodando)
    if TARGET_EXE != CURRENT_EXE:
        log(f"Também encerrando qualquer {TARGET_EXE} pendente...")
        try:
            subprocess.run(["taskkill", "/F", "/IM", TARGET_EXE], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except Exception:
            pass
        
    time.sleep(3)  # Pausa para o SO liberar os File Handles
    success = False
    max_retries = 10
    
    for i in range(max_retries):
        try:
            # Remove o exe antigo (pode ser agent.exe OU Doc-IT-agent.exe)
            for old_exe in set([CURRENT_EXE, TARGET_EXE]):
                if os.path.exists(old_exe):
                    log(f"Deletando {old_exe} antigo (Tentativa {i+1}/{max_retries})...")
                    os.remove(old_exe)
            
            # Renomeia o novo para o nome final correto
            log(f"Renomeando {NEW_EXE} para {TARGET_EXE}...")
            os.rename(NEW_EXE, TARGET_EXE)
            success = True
            break
            
        except Exception as e:
            log(f"Acesso Negado ou arquivo em uso. Aguardando... {e}")
            time.sleep(2)
            
    if not success:
        log(f"ERRO FATAL: Impossivel substituir apos {max_retries} tentativas.")
        sys.exit(1)
        
    # Ressurreição com o nome correto
    log(f"Atualização aplicada com sucesso! Reiniciando {TARGET_EXE}...")
    try:
        subprocess.Popen([TARGET_EXE], creationflags=subprocess.CREATE_NEW_CONSOLE | subprocess.CREATE_NO_WINDOW)
    except Exception as e:
        log(f"Erro ao tentar acordar o novo agente: {e}")
        
    log("Updater finalizado com sucesso.")
    sys.exit(0)
