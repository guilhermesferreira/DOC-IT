# Doc-IT: IT Asset Management & Monitoring System

![Doc-IT Banner](https://img.shields.io/badge/Status-Em_Desenvolvimento-blue)
![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?logo=prisma)
![React](https://img.shields.io/badge/React-18.x-61DAFB?logo=react)
![Node.js](https://img.shields.io/badge/Node.js-Backend-339933?logo=node.js)

O **Doc-IT** é um sistema moderno de Inventário Técnico e Monitoramento de Ativos que consolida a gestão de hardware, infraestrutura e identidades corporativas em um painel único e responsivo. Construído com as melhores práticas de seguridade da atualidade.

---

## 🚀 Principais Funcionalidades

- **Dashboard Executivo:** Métricas em tempo real do ecossistema computacional, incluindo alertas, hardwares ativos e relatórios rápidos.
![Painel Dashboard](C:\Users\guilherme.ferreira\.gemini\antigravity\brain\d5022cc5-51ae-4873-867b-0d00728ca728\dashboard_view_1771977383634.png)
- **Detalhamento Modular do Agente:** Ao abrir um dipositivo coletado, visualize em abas categorizadas o Perfil de Rede (IPv4/IPv6, MAC), Instalações de Software e Componentes de Hardware atualizados e geridos em tempo real.
![Abas do Agente](C:\Users\guilherme.ferreira\.gemini\antigravity\brain\d5022cc5-51ae-4873-867b-0d00728ca728\device_details_tabs_1771977646019.png)
- **Console Web Reverso (Remote Control):** Operadores avançados possuem acesso a um Terminal via WebSocket embutido no Dashboard, permitindo execução de comandos no shell nativo do host sem necessidade de RDP ou conexões LAN diretas.
![Console Web Remoto](C:\Users\guilherme.ferreira\.gemini\antigravity\brain\d5022cc5-51ae-4873-867b-0d00728ca728\device_remote_control_1771977657665.png)
- **Inventário Contínuo:** Visão de ponta a ponta sobre computadores aprovados e comunicáveis na rede.
![Tabela de Dispositivos e Status](C:\Users\guilherme.ferreira\.gemini\antigravity\brain\d5022cc5-51ae-4873-867b-0d00728ca728\inventory_view_1771977392454.png)
- **Matriz de Acessos Dinâmica (RBAC):** Sistema robusto onde o `SuperAdministrador` cria perfis ilimitados na plataforma (Grupos). Um atendente, por exemplo, pode ser proibido de ler informações cruciais mas ter acesso livre para listar equipamentos do Inventário. As telas reagem omitindo os botões.
![O Painel RBAC](C:\Users\guilherme.ferreira\.gemini\antigravity\brain\d5022cc5-51ae-4873-867b-0d00728ca728\settings_groups_1771977441913.png)
- **Painel de Segurança e MFA:** Suporte altamente integrado na UI de Perfil de Usuário para vincular Google Workspace ou Microsoft Authenticator (2FA). O próprio backend armazena e exige as restrições secretas MFA bloqueando acessos diretos via API.
![Setup do MFA na interface do usuário](C:\Users\guilherme.ferreira\.gemini\antigravity\brain\d5022cc5-51ae-4873-867b-0d00728ca728\settings_mfa_1771977624859.png)
- **Gerenciamento de Scripts Remotos:** Permissão granular de gestão do motor (Polling/Sync) que rege as sondas remotas Python responsáveis pelas varreduras.

---

## 🛠️ Stack Tecnológica

O Doc-IT é dividido em um núcleo de interface Premium e um motor transacional isolado:

### Frontend
- **React.js (Vite):** Rendering performático com foco extremo em UX (Avatares, Badges Coloridos e Transições Elegantes).
- **Lucide-React:** Set iconográfico minimalista padrão da indústria.
- **React Router:** Rotas Client-Side limpas e fluidas, integrando o ContextAPI para Lifecycle Perfeito Sem Cache (Hot-Load JWT).

### Backend
- **Node.js com Express:** Motor API escalável em arquitetura de Rotas e Controladores Isolados (`auth`, `users`, `groups`, `inventory`).
- **Autenticação:** Cookies `HttpOnly`, `SameSite=None` via HTTPS + Assinatura de Tokens JWT estendidos com Matrizes Booleanas de Controle de Risco e TLS Nativo.
- **Banco de Dados (Prisma ORM):** Interações agnósticas com persistência em PostgreSQL/Memória local protegendo-se contra injeções SQL.
- **Seed Automation:** Setup automático de tabelas `seed-groups.js` garantindo Papéis Críticos Iniciais no ambiente (`SuperAdmin`, `Admin`, `Read-Only`).

---

## ⚙️ Instalação e Ambiente Local

1. **Clone do Repositório:**
   ```bash
   git clone https://github.com/SeuUsuario/Doc-IT.git
   cd Doc-IT
   ```

2. **Backend (API):**
   ```bash
   cd backend
   npm install
   # Configure o arquivo .env contendo DATABASE_URL e JWT_SECRET
   npx prisma db push
   npx prisma generate
   node seed-groups.js # Inicializar os Grupos Base do DB
   npm run dev
   ```

3. **Frontend (Dashboard):**
   ```bash
   cd ../frontend
   npm install
   # Configure o arquivo .env contendo VITE_API_BASE_URL (ex: https://localhost:3000)
   npm run dev
   ```

## 🔒 Segurança

Por padrão, a plataforma deve operar estritamente sobre portas `HTTPS`, sendo o `token` de sessão completamente invisível contra requisições XSS do navegador na ponta de Cliente. O Sistema Doc-IT defende as rotas com validadores `authMiddleware` somado as travas personalizadas do `requirePermission('nomeDoPrivilegio')` recondicionado de dentro do Payload para bloquear invasores no nível do Servidor.

