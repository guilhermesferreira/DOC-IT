const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const OSQUERY_TEMPLATES = [
    { title: "Tempo de Atividade (Uptime)", sql: "SELECT * FROM uptime;", description: "Mostra o tempo que a máquina está ligada." },
    { title: "Informações do Sistema", sql: "SELECT hostname, cpu_brand, physical_memory, hardware_vendor, hardware_model FROM system_info;", description: "Detalhes de hardware e versão do SO." },
    { title: "Usuários Locais", sql: "SELECT uid, username, description, directory FROM users;", description: "Lista todas as contas de usuário locais." },
    { title: "Administradores Locais", sql: "SELECT * FROM users JOIN user_groups USING (uid) WHERE gid = 'S-1-5-32-544';", description: "Lista usuários do grupo de Administradores." },
    { title: "Programas Inicializados (Startup)", sql: "SELECT name, path, source FROM startup_items;", description: "Programas configurados para iniciar com o Windows." },
    { title: "Processos em Execução", sql: "SELECT pid, name, path, on_disk, state, resident_size FROM processes ORDER BY resident_size DESC LIMIT 20;", description: "Top 20 processos que mais consomem memória." },
    { title: "Portas Abertas (Listening)", sql: "SELECT lp.port, lp.protocol, p.name, p.path FROM listening_ports lp JOIN processes p ON lp.pid = p.pid WHERE lp.port != 0;", description: "Serviços e processos aguardando conexão de rede." },
    { title: "Tarefas Agendadas", sql: "SELECT name, hidden, state, next_run_time, path FROM scheduled_tasks;", description: "Verifica as tarefas agendadas no sistema." },
    { title: "Softwares Instalados", sql: "SELECT name, version, publisher, install_date FROM programs;", description: "Lista de todos os softwares instalados na máquina." },
    { title: "Compartilhamentos de Rede", sql: "SELECT name, path, description, type FROM shared_resources;", description: "Pastas e recursos compartilhados na rede." },
    { title: "Rotas de Rede", sql: "SELECT destination, netmask, gateway, interface, metric FROM routes;", description: "Tabela de roteamento local da máquina." },
    { title: "Dispositivos USB Histórico", sql: "SELECT usb_address, usb_port, model, serial FROM usb_devices;", description: "Lista dispositivos USB conectados recentemente." }
];

async function seedTemplates() {
    console.log('Iniciando provisionamento dos Templates Osquery...');

    try {
        // Create templates if they don't exist by title
        for (const tpl of OSQUERY_TEMPLATES) {
            const existing = await prisma.osqueryTemplate.findFirst({
                where: { title: tpl.title }
            });
            if (!existing) {
                await prisma.osqueryTemplate.create({ data: tpl });
                console.log(`[Seed] Template '${tpl.title}' criado.`);
            } else {
                console.log(`[Seed] Template '${tpl.title}' já existe.`);
            }
        }

        console.log('--- Provisionamento de Templates Concluído ---');
    } catch (err) {
        console.error('Erro ao executar o Seed de Templates:', err);
    } finally {
        await prisma.$disconnect();
    }
}

seedTemplates();
