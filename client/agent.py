import platform
import socket
import uuid # Embora não seja mais o método principal para MAC, pode ser mantido se necessário para algo.
import re
import psutil
import json
import winreg # Módulo específico para o Registro do Windows
import subprocess # Para obter UUID de hardware

#futuro: uptime
#futuro: drivers
#futuro: status do firewall
#futuro: portas USB
#futuro: usuarios locais / ativos / logados
#futuro: workgroup
#futuro: ultima atualização / envio


def get_installed_software():
    """
    Coleta a lista de softwares instalados lendo o Registro do Windows.
    Esta função é específica para Windows.
    """
    software_list = []
    uninstall_paths = [
        r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
        r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"
    ]
    
    for path in uninstall_paths:
        try:
            key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, path)
            for i in range(0, winreg.QueryInfoKey(key)[0]):
                subkey_name = winreg.EnumKey(key, i)
                subkey_path = rf"{path}\{subkey_name}"
                try:
                    subkey = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, subkey_path)
                    display_name, _ = winreg.QueryValueEx(subkey, "DisplayName")
                    # Tenta obter a versão, mas não falha se não existir
                    try:
                        display_version, _ = winreg.QueryValueEx(subkey, "DisplayVersion")
                    except OSError:
                        display_version = "N/A" # Ou None, ou string vazia
                    
                    if display_name.strip():
                        software_list.append({"name": display_name, "version": display_version})
                    winreg.CloseKey(subkey)
                except OSError:
                    # Ignora chaves que não têm DisplayName (ex: atualizações do Windows)
                    pass
        except FileNotFoundError:
            # Ignora se o caminho do Registro não for encontrado
            pass

    unique_software_tuples = {tuple(d.items()) for d in software_list}
    unique_software = [dict(t) for t in unique_software_tuples]
    return sorted(unique_software, key=lambda x: x['name'].lower())

def get_windows_hardware_uuid():
    """
    Obtém o UUID de hardware da máquina Windows usando um comando WMI.
    Este é um identificador mais estável do que um UUID gerado aleatoriamente.
    """
    try:
        # Comando para obter o UUID da placa-mãe via WMI
        result = subprocess.check_output("wmic csproduct get uuid", shell=True, text=True, stderr=subprocess.DEVNULL)
        # O output vem com o cabeçalho "UUID" e linhas em branco.
        # Precisamos limpar isso para pegar apenas o valor.
        hardware_uuid = result.strip().split("\n")[-1].strip()
        if hardware_uuid and hardware_uuid != "FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF":
            return hardware_uuid
    except Exception as e:
        print(f"Aviso: Não foi possível obter o UUID do hardware via WMI: {e}")
    # Fallback para um UUID aleatório se o do hardware não puder ser obtido
    return str(uuid.uuid4())

def get_system_inventory():
    """
    Coleta todas as informações do sistema e as retorna em um dicionário.
    """
    inventory_data = {}

    # --- Informações de Sistema e Hardware ---
    inventory_data["machine_uuid"] = get_windows_hardware_uuid()
    inventory_data["hostname"] = socket.gethostname()
    inventory_data["os_name"] = f"{platform.system()} {platform.release()}"
    inventory_data["os_version"] = platform.version()
    
    # Tenta obter um nome de processador mais limpo
    try:
        # No Windows, platform.processor() pode já ser bom.
        # Em outros sistemas, ou para mais detalhes, cpuinfo poderia ser usado, mas para simplificar:
        cpu_model = platform.processor()
        # Tenta limpar strings comuns de informações extras em alguns sistemas
        cpu_model = re.sub(r'\((TM|tm|R|r)\)', '', cpu_model).strip()
        cpu_model = re.sub(r' +', ' ', cpu_model) # Remove espaços múltiplos
        inventory_data["cpu_model"] = cpu_model
    except Exception:
        inventory_data["cpu_model"] = platform.processor() # Fallback

    
    mem = psutil.virtual_memory()
    inventory_data["ram_total_gb"] = round(mem.total / (1024**3), 2)

    disks_info = []
    partitions = psutil.disk_partitions()
    for p in partitions:
        # Filtra tipos de partições que geralmente não são discos de usuário (ex: 'squashfs' em Linux live USBs)
        # ou sistemas de ficheiros de dispositivos removíveis que podem não estar prontos.
        # Para Windows, 'opts' pode conter 'fixed' para discos fixos.
        if 'cdrom' in p.opts or p.fstype == '':
            continue
        try:
            usage = psutil.disk_usage(p.mountpoint)
            disk_info_item = {
                "drive": p.mountpoint,
                "total_gb": round(usage.total / (1024**3), 2),
                "free_gb": round(usage.free / (1024**3), 2),
                "filesystem_type": p.fstype
            }
            disks_info.append(disk_info_item)
        except (PermissionError, FileNotFoundError):
            # Ignora drives que não podem ser acessados ou pontos de montagem inválidos
            continue
    inventory_data["disks"] = disks_info

    # --- Informações de Rede Detalhadas por Interface Ativa ---
    network_interfaces_info = []
    interface_addresses = psutil.net_if_addrs() # Todos os endereços por interface
    interface_stats = psutil.net_if_stats()     # Estatísticas das interfaces (incluindo se está 'up')

    for interface_name, snic_list in interface_addresses.items():
        # Verifica se a interface está ativa (up) e não é de loopback
        if interface_name in interface_stats and interface_stats[interface_name].isup and \
           not (interface_name.lower().startswith('lo') or "loopback" in interface_name.lower()):
            
            current_interface_details = {
                "interface_name": interface_name,
                "ipv4_addresses": [],
                "mac_addresses": []
            }
            
            has_relevant_ipv4 = False # Flag para saber se a interface tem IPv4 não link-local

            for snic in snic_list:
                if snic.family == socket.AF_INET: # Endereço IPv4
                    # Ignora endereços APIPA (169.254.x.x) que indicam falha no DHCP
                    # e também endereços de loopback (já filtrados, mas uma verificação extra não faz mal)
                    if not snic.address.startswith("169.254.") and not snic.address.startswith("127."):
                        current_interface_details["ipv4_addresses"].append({
                            "ip_address": snic.address,
                            "netmask": snic.netmask if snic.netmask else "N/A",
                        })
                        has_relevant_ipv4 = True
                elif snic.family == psutil.AF_LINK: # Endereço MAC (Hardware)
                    if snic.address and snic.address.lower() != "00:00:00:00:00:00":
                        current_interface_details["mac_addresses"].append(snic.address.upper())
            
            # Adiciona a interface à lista APENAS se ela tiver algum endereço IPv4 relevante.
            if has_relevant_ipv4:
                current_interface_details["mac_addresses"] = list(set(current_interface_details["mac_addresses"]))
                # Se não houver MACs, pode-se deixar a lista vazia ou adicionar "N/A"
                if not current_interface_details["mac_addresses"]:
                    current_interface_details["mac_addresses"].append("N/A") # Ou deixar lista vazia
                network_interfaces_info.append(current_interface_details)
            
    inventory_data["network_interfaces"] = network_interfaces_info

    # --- Informações de Software ---
    inventory_data["installed_software"] = get_installed_software()
    
    return inventory_data

if __name__ == "__main__":
    #print("Coletando informações do sistema...")
    
    inventory = get_system_inventory()
    
    output_filename = "inventario.txt"
    try:
        with open(output_filename, "w", encoding="utf-8") as f:
            json.dump(inventory, f, indent=4, ensure_ascii=False)
      #  print(f"Inventário salvo com sucesso no arquivo: {output_filename}")
    except Exception as e:
        print(f"Erro ao salvar o arquivo: {e}")