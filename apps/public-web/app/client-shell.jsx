"use client";

import dynamic from 'next/dynamic';

const ClientApp = dynamic(() => import('../src/main.jsx'), { ssr: false });

export default function ClientShell() {
  return <ClientApp />;
}