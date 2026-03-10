import win32pipe
import win32file
import win32security
import win32con
import pywintypes
import json
import time
import sys

CORE_PIPE = r'\\.\pipe\DocIT_Core_IPC'
REMOTE_PIPE = r'\\.\pipe\DocIT_Remote_IPC'

def test_pipe_access(pipe_name):
    print(f"\n[TEST] Verificando acesso ao Pipe: {pipe_name}")
    try:
        handle = win32file.CreateFile(
            pipe_name,
            win32file.GENERIC_READ | win32file.GENERIC_WRITE,
            0, None,
            win32file.OPEN_EXISTING,
            0, None
        )
        print(f"  [OK] Conexão estabelecida com {pipe_name}")
        win32file.CloseHandle(handle)
        return True
    except pywintypes.error as e:
        if e.winerror == 5: # Access Denied
            print(f"  [BLOCKED] Acesso Negado (Esperado se não for Admin/System): {e}")
        elif e.winerror == 2: # File Not Found
            print(f"  [ERROR] Pipe não encontrado. O serviço está rodando? {e}")
        else:
            print(f"  [FAIL] Erro inesperado: {e}")
        return False

def test_token_validation(pipe_name, valid_token):
    print(f"\n[TEST] Verificando validação de Token em {pipe_name}")
    
    payloads = [
        {"desc": "Sem Token", "data": {"action": "get_config"}},
        {"desc": "Token Inválido", "data": {"action": "get_config", "token": "invalid_123"}},
        {"desc": "Token Válido", "data": {"action": "get_config", "token": valid_token}}
    ]
    
    for p in payloads:
        print(f"  --> Testando: {p['desc']}")
        try:
            handle = win32file.CreateFile(
                pipe_name,
                win32file.GENERIC_READ | win32file.GENERIC_WRITE,
                0, None,
                win32file.OPEN_EXISTING,
                0, None
            )
            win32pipe.SetNamedPipeHandleState(handle, win32pipe.PIPE_READMODE_MESSAGE, None, None)
            win32file.WriteFile(handle, json.dumps(p['data']).encode('utf-8'))
            
            # Tenta ler resposta (Core envia resposta para get_config)
            if pipe_name == CORE_PIPE and p['desc'] == "Token Válido":
                try:
                    resp, data = win32file.ReadFile(handle, 65536)
                    print(f"      [RESULT] Resposta recebida (Tamanho: {len(data)} bytes)")
                    # Tenta parsear pra validar que é JSON valido
                    parsed = json.loads(data.decode('utf-8'))
                    print(f"      [RESULT] Status do get_config: {parsed.get('status')}")
                except Exception as read_ex:
                    print(f"      [RESULT] Nenhuma resposta válida (Erro: {read_ex})")
            elif pipe_name == CORE_PIPE:
                print(f"      [RESULT] Esperando recusa (Sem resposta ativa programada)")
            
            win32file.CloseHandle(handle)
        except Exception as e:
            print(f"      [FAIL] Erro ao enviar payload: {e}")

if __name__ == "__main__":
    print("=== Doc-IT Security Test: IPC Named Pipes ===")
    
    # Testa acesso básico
    test_pipe_access(CORE_PIPE)
    test_pipe_access(REMOTE_PIPE)
    
    if len(sys.argv) > 1:
        token = sys.argv[1]
        test_token_validation(CORE_PIPE, token)
    else:
        print("\n[SKIP] Pulei teste de validação de token por falta de token CLI.")
        print("Uso: python test_ipc_security.py <TOKEN_DO_LOG>")
