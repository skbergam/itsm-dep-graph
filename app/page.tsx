"use client";

import dynamic from "next/dynamic";

const DependencyGraph = dynamic(() => import("@/components/DependencyGraph"), {
  ssr: false,
});

export default function Home() {
  return <DependencyGraph />;
}
