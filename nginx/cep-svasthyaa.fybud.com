server {
    listen 80;
    listen [::]:80;

    server_name cep-svasthyaa.fybud.com;

    location / {
        proxy_pass http://127.0.0.1:9000;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    listen [::]:80;

    server_name api.cep-svasthyaa.fybud.com;

    client_max_body_size 105m;
    proxy_read_timeout 120s;

    location / {
        proxy_pass http://127.0.0.1:4100;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
