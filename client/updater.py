import os
import sys
import time
import subprocess
import shutil


def log(msg):
    with open("updater.log", "a") as f:
        f.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')} - {msg}\n")

if __name__ == "__main__":
    TARGET_EXE = sys.argv[1] if len(sys.argv) > 1 else "agent.exe"
    NEW_EXE = sys.argv[2] if len(sys.argv) > 2 else "agent_new.exe"
    
    log(f"Iniciando processo de atualização (The Two-Stage Drop). Alvo: {TARGET_EXE}")
    
    # 1. Garante que o agent original está morto disparando um kill command do Windows
    log(f"Forçando o encerramento de qualquer {TARGET_EXE} pendente via Taskkill...")
    try:
        subprocess.run(["taskkill", "/F", "/IM", TARGET_EXE], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception as e:
        log(f"Aviso no Taskkill: {e}")
        
    time.sleep(2) # Pausa dramática para o SO limpar os File Handles da memória
    success = False
    
    for i in range(max_retries):
        try:
            if os.path.exists(TARGET_EXE):
                log(f"Deletando {TARGET_EXE} antigo (Tentativa {i+1}/{max_retries})...")
                os.remove(TARGET_EXE) # Se Falhar aqui (Acesso Negado), cai no except
            
            # Se não existir ou se deletou com sucesso
            log(f"Extraindo e renomeando {NEW_EXE} para {TARGET_EXE}...")
            os.rename(NEW_EXE, TARGET_EXE)
            success = True
            break
            
        except Exception as e:
            log(f"Acesso Negado ou arquivo em uso. Aguardando a morte do processo pai... {e}")
            time.sleep(2)
            
    if not success:
        log(f"ERRO FATAL: Impossivel descarregar e substituir {TARGET_EXE} apos {max_retries} tentativas.")
        sys.exit(1)
        
    # 4. Ressurreição
    log("Atualização aplicada com sucesso! Reiniciando o novo Agente...")
    try:
        # Usa Popen para desvincular o processo filho do updater
        subprocess.Popen([TARGET_EXE], creationflags=subprocess.CREATE_NEW_CONSOLE | subprocess.CREATE_NO_WINDOW)
    except Exception as e:
        log(f"Erro ao tentar acordar o novo agente: {e}")
        
    log("Updater finalizado. Cometi suicídio com sucesso.")
    sys.exit(0)
