#!/usr/bin/env python3
# capture-proxy.py — proxy HTTP/HTTPS mínimo (sem dependências) para DESCOBRIR o
# host do servidor do app UniTV. Aponte o proxy do celular/box para este PC:8080,
# abra o app e faça login uma vez. Ele registra todos os hosts contatados.
#
# Para HTTPS ele só vê o hostname (via CONNECT) — que é exatamente o que precisamos.
# Para HTTP em claro, ele também loga o caminho e o corpo do POST de login.
#
# Uso:  python tools/capture-proxy.py
import socket, threading, select, sys, datetime, re, os

LISTEN = ('0.0.0.0', 8080)
LOG = os.path.join(os.path.dirname(__file__), 'capture.log')
hosts = set()

def ts(): return datetime.datetime.now().strftime('%H:%M:%S')

def log(msg):
    line = f'[{ts()}] {msg}'
    print(line, flush=True)
    with open(LOG, 'a', encoding='utf-8') as f:
        f.write(line + '\n')

def pipe(a, b):
    try:
        while True:
            r, _, _ = select.select([a, b], [], [], 30)
            if not r: break
            for s in r:
                data = s.recv(65536)
                if not data: return
                (b if s is a else a).sendall(data)
    except Exception:
        pass
    finally:
        for s in (a, b):
            try: s.close()
            except Exception: pass

def handle(client):
    try:
        client.settimeout(20)
        req = client.recv(65536)
        if not req: client.close(); return
        line1 = req.split(b'\r\n', 1)[0].decode('latin1', 'ignore')
        parts = line1.split(' ')
        if len(parts) < 2: client.close(); return
        method, target = parts[0], parts[1]

        if method == 'CONNECT':  # HTTPS — só o host aparece, e já basta
            host, _, port = target.partition(':')
            port = int(port or 443)
            if host not in hosts:
                hosts.add(host); log(f'HTTPS host  ->  {host}:{port}   <<< POSSÍVEL API/CDN')
            upstream = socket.create_connection((host, port), timeout=20)
            client.sendall(b'HTTP/1.1 200 Connection Established\r\n\r\n')
            pipe(client, upstream)
        else:  # HTTP em claro — loga host, caminho e corpo (login!)
            m = re.match(r'https?://([^/:]+)(:(\d+))?(/[^ ]*)?', target)
            if m:
                host = m.group(1); port = int(m.group(3) or 80); path = m.group(4) or '/'
            else:
                hm = re.search(r'Host:\s*([^\r\n:]+)', req.decode('latin1', 'ignore'))
                host = hm.group(1).strip() if hm else None; port = 80; path = target
            if not host: client.close(); return
            if host not in hosts:
                hosts.add(host); log(f'HTTP  host  ->  {host}')
            log(f'HTTP  {method} {host}{path}')
            body = req.split(b'\r\n\r\n', 1)
            if len(body) > 1 and body[1]:
                snippet = body[1][:600].decode('latin1', 'ignore')
                if snippet.strip(): log(f'      body: {snippet}')
            upstream = socket.create_connection((host, port), timeout=20)
            upstream.sendall(req)
            pipe(client, upstream)
    except Exception as e:
        try: client.close()
        except Exception: pass

def main():
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind(LISTEN); srv.listen(200)
    log('=' * 60)
    log(f'PROXY DE CAPTURA ativo em {LISTEN[0]}:{LISTEN[1]}')
    log('No celular/box: Wi-Fi -> Proxy manual -> 192.168.0.19 : 8080')
    log('Depois abra o app UniTV e faça login. Os hosts aparecem abaixo.')
    log('=' * 60)
    while True:
        c, addr = srv.accept()
        threading.Thread(target=handle, args=(c,), daemon=True).start()

if __name__ == '__main__':
    main()
