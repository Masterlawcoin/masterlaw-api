# Instalación desde Termux (celular)

## Paso a paso

```bash
# 1. Actualizar Termux
pkg update && pkg upgrade -y

# 2. Instalar Node.js
pkg install nodejs -y

# 3. Instalar git
pkg install git -y

# 4. Clonar tu repo (cuando lo hayas subido a GitHub)
git clone https://github.com/TU-USUARIO/masterlaw-api.git
cd masterlaw-api

# 5. Instalar dependencias
npm install

# 6. Crear archivo .env
cp .env.example .env
nano .env
# Completa con tus valores reales

# 7. Ejecutar API
node server.js

# Para que corra en background (Termux):
nohup node server.js > api.log 2>&1 &
echo $! > api.pid

# Para detener:
kill $(cat api.pid)

# Ver logs en tiempo real:
tail -f api.log
```

## Para subir a GitHub

```bash
# Desde Termux o VS Code
cd masterlaw-api
git init
git add .
git commit -m "feat: MasterlawIA API v1.0"
git remote add origin https://github.com/TU-USUARIO/masterlaw-api.git
git push -u origin main
```

## Luego en Vercel

1. Ir a vercel.com
2. "New Project" → importar desde GitHub
3. Agregar variables de entorno (las del .env)
4. Deploy automático

La URL de tu API será: https://masterlaw-api.vercel.app
