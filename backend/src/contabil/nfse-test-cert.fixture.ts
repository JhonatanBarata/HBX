// ===========================================================================
// CONTABIL S6 — Certificado de TESTE (auto-assinado) para os testes de NFS-e.
// ---------------------------------------------------------------------------
// PEM gerado 1x com OpenSSL (rsa:2048, self-signed, validade 10 anos):
//   openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -nodes
//     -days 3650 -subj "/CN=HBX Teste NFSe/O=HBX Sistemas LTDA/C=BR"
// Inlinado como constante (não como arquivo .pem) para o teste rodar do `dist/`
// sem copiar fixtures nem depender do OpenSSL no runtime do teste. É um cert de
// TESTE — jamais um segredo real. A assinatura da DPS é validada CONTRA ele
// (createVerify), sem NENHUMA chamada de rede. NÃO é o certificado do dono.
// ===========================================================================

export const TEST_CERT_PEM = `-----BEGIN CERTIFICATE-----
MIIDZTCCAk2gAwIBAgIUTOThEvFcCZYTLQo0vEFRHFfkLo4wDQYJKoZIhvcNAQEL
BQAwQjEXMBUGA1UEAwwOSEJYIFRlc3RlIE5GU2UxGjAYBgNVBAoMEUhCWCBTaXN0
ZW1hcyBMVERBMQswCQYDVQQGEwJCUjAeFw0yNjA3MDMwNTIxNDRaFw0zNjA2MzAw
NTIxNDRaMEIxFzAVBgNVBAMMDkhCWCBUZXN0ZSBORlNlMRowGAYDVQQKDBFIQlgg
U2lzdGVtYXMgTFREQTELMAkGA1UEBhMCQlIwggEiMA0GCSqGSIb3DQEBAQUAA4IB
DwAwggEKAoIBAQCKeW9guFiBfSdQBwvR1lvWtossde/GnK/pPl8+RqUvnkDIHOBI
B4eZOL71Ae381Pp/wffFCigZP7ik3DIZQ+Dn6jNWONyGkrZUtHlTZzoLpirKzeyG
ono9WqfYXoC9v0DmgPDxZVDMI5R3UMx3aOFX7gC/PAC8m91jqU3JesS9423fYbJL
pUg+NHg5TJK/lmmM9wtE21vAOCpznDpyT3b8jFhfkfMrAn5KrjWBKRLICMQs+M+H
OLPl5dxLQsvsLrWvMEUXWl/VAdUEwvUgJ0ZoLLAz6rNhzrC3m0aJhkoYjxaR2FCS
QG84kE0DSyB8RMW7xdvslayPEDwZ+VKImUOlAgMBAAGjUzBRMB0GA1UdDgQWBBRO
iGHaPkHIdyasleBMlSNsqyNMODAfBgNVHSMEGDAWgBROiGHaPkHIdyasleBMlSNs
qyNMODAPBgNVHRMBAf8EBTADAQH/MA0GCSqGSIb3DQEBCwUAA4IBAQBzDKvBzsyp
LvSugd1z0tTFWnoXwNVNafFTdfOBzJLUAr/bReWzr1pxPgRo6wxidDcKxLWwZynE
XfTJMuumQbhrKj0x3jMTWRvC0F5r6pXhqysMIP4uaQeIMPxKO/ZZvQz+GGoPiRdg
RbKpKvAIiUvlFcA9ujPNsIsbCiqmxmSFsqpWg6M/pOXnV9nrCJZv0/fCa0HdvI9t
GGu3Jn09CpA1O0qU1Xv7iZnCo9/bb+KX8hK8m2PWzvz4dWgxJOftkeYuVL8mdtqW
l8TvGG1Y93ivuRmyYXy/1sdTob+/PwmlcqMvMv5uJGArQm0owhpsqkchP92+HqUG
pXL5+YbiT3+9
-----END CERTIFICATE-----
`;

export const TEST_KEY_PEM = `-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQCKeW9guFiBfSdQ
BwvR1lvWtossde/GnK/pPl8+RqUvnkDIHOBIB4eZOL71Ae381Pp/wffFCigZP7ik
3DIZQ+Dn6jNWONyGkrZUtHlTZzoLpirKzeyGono9WqfYXoC9v0DmgPDxZVDMI5R3
UMx3aOFX7gC/PAC8m91jqU3JesS9423fYbJLpUg+NHg5TJK/lmmM9wtE21vAOCpz
nDpyT3b8jFhfkfMrAn5KrjWBKRLICMQs+M+HOLPl5dxLQsvsLrWvMEUXWl/VAdUE
wvUgJ0ZoLLAz6rNhzrC3m0aJhkoYjxaR2FCSQG84kE0DSyB8RMW7xdvslayPEDwZ
+VKImUOlAgMBAAECggEACluSeUIuEUN8BbhSie0rh0LguUrktu8LQ8T6qU/DSoL0
bAjS6Dhd9sKf7/d8u8PE1/pkLtd3ZTTBujJ5RzAEr5GHqlb2/H7sB1J3h8WfJHYX
BH6aMajkwALwWUFvsPcQYvLOnZ57MxskigyKZWfRgTr9eyXBFVqK7l811mX/N4fN
Bn1yblSz91P1wX1MjRaHOsNG3a/1TcRcyweJP+1vgUgc7TD/er/LR4jBQg68T81a
h+cDvuZkJDh7AOVPyng0sHR1mmIRFUGvLTUeva/f+e/tMlAwtRZD70yTMQcIphOZ
iysufV5j3MXRclz+LjdOYFsj8dQiBJ75EdyWD4s6sQKBgQDCj+SMG2+Xa5CgM/0p
UEWZj8u2/sZxEDV/qIMGv7jyPhFQhbywx8ab054Gjcc2/GXBRGaPTdb6I2T5U4Na
Ob1SCXG5+QL0aK5pozP9A9Vm+kLPqcBrqwkEQh28HdwUSkC5xZpZBGLH/DkP8D22
jl3v87evm7UbiYr0V11pHf0yUQKBgQC2M36dk58m6OZCDYhMM0tqvFa7iqnkIofM
DUKtpNOJGzsK6okCdn1kZB0AeltDei/Ucoc5YhGyT+zDO0XRAZUNq/onEWzGr+sk
lxWUiU+s3IoUpTsrMu2+p7pl5gPm89qzSmrwnDqfqv/8GHcHDVhFYJNBcitjSqwy
sU+SE24zFQKBgA1hTetgu6TjLdgGm0NrFM5BuFXGYalG3xb/ZLtjFfn60MAD4n0Z
0AvJWtXCjE+4vdqztIXoaX9cTcZjuuXKkL2CjsKmYFCknlH/ekTNLbDeRxf26Ze9
9GnJjjfwqcDvdlIQR9QVXCG6s8Xn1KaoVcd5sEkwYR0asWaqV28yM8ZxAoGADkjH
Om9iYNiNhMwuzVqQJRQS8K0UWLBkWRkJCzgK5Yre/CIbD7heaEp5A5qUIRwpN8yq
0VLg9EvT0hKJjLNFDkdXW0zAbGtKUhoONRD20CSSJsA1fVOG1BWuRWLdF3Qyxy+k
Zqy449+yJf99BW6EZxwFL3JV+HjYOzkvddJUJ2kCgYBPL+cou7yqhlNm3Fc9bnkl
y9sPQvb8dyGGOuIEa5ZEDy69Hm51EtTpKFCRzjPq7pPj/QQ9PJWChY4uG63QP3pe
B78eGBVrEfL7A4t1wB2y7+S1TQjMcu6849kTJplUVLg1i0eitGm3hloO3CwTIwOl
F7b4M5T4AI9UtWlDVOX10g==
-----END PRIVATE KEY-----
`;
