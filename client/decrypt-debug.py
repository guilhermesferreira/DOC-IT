import sys
import os
import json
from cryptography.fernet import Fernet

# Esta é a mesma chave do Doc-IT-Core.py
ENCRYPTION_KEY = b'r7xK9sLpR2vM4N8wQ3tA5yB1uC6zD0fHjI7oP9lK3nU='
cipher_suite = Fernet(ENCRYPTION_KEY)
CONFIG_FILE = "Doc-IT.dat"

def main():
    print(f"--- Doc-IT Decrypt Debug Tool ---")
    
    if not os.path.exists(CONFIG_FILE):
        print(f"[ERRO] Arquivo '{CONFIG_FILE}' não encontrado no diretório atual.")
        sys.exit(1)
        
    try:
        with open(CONFIG_FILE, "rb") as f:
            encrypted_data = f.read()
            
        print("[INFO] Lendo dados criptografados...")
        decrypted_data = cipher_suite.decrypt(encrypted_data)
        
        # Parse para testar se é JSON válido
        parsed_json = json.loads(decrypted_data.decode('utf-8'))
        
        print("\n[SUCESSO] Arquivo descriptografado! Conteúdo Original:\n")
        print(json.dumps(parsed_json, indent=4, ensure_ascii=False))
        
    except Exception as e:
        print(f"\n[FALHA] Não foi possível decriptar o arquivo. A chave não bate ou corrompido.")
        print(f"Erro Real: {e}")

if __name__ == "__main__":
    main()
