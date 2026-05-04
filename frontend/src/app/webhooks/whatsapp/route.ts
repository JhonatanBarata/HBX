import { NextRequest, NextResponse } from 'next/server';

function getBackendBaseUrl() {
  const fallback = process.env.NODE_ENV === 'production' ? 'https://api.hbxsystem.com.br' : 'http://localhost:3000';
  return (process.env.NEXT_PUBLIC_API_URL || process.env.BACKEND_URL || fallback).replace(/\/$/, '');
}

function buildBackendUrl(pathWithQuery: string) {
  return `${getBackendBaseUrl()}${pathWithQuery}`;
}

export async function GET(request: NextRequest) {
  const backendUrl = buildBackendUrl(`/webhooks/whatsapp${request.nextUrl.search}`);
  const response = await fetch(backendUrl, {
    method: 'GET',
    headers: {
      accept: request.headers.get('accept') || 'text/plain',
    },
    cache: 'no-store',
  });

  const text = await response.text();
  return new NextResponse(text, {
    status: response.status,
    headers: {
      'content-type': response.headers.get('content-type') || 'text/plain; charset=utf-8',
    },
  });
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const backendUrl = buildBackendUrl('/webhooks/whatsapp');
  const response = await fetch(backendUrl, {
    method: 'POST',
    headers: {
      'content-type': request.headers.get('content-type') || 'application/json',
      'x-hub-signature-256': request.headers.get('x-hub-signature-256') || '',
    },
    body,
    cache: 'no-store',
  });

  const text = await response.text();
  return new NextResponse(text, {
    status: response.status,
    headers: {
      'content-type': response.headers.get('content-type') || 'application/json; charset=utf-8',
    },
  });
}
