import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

// Ensure Unistyles runs before Expo Router statically renders each page.
import "../styles/unistyles";

const webEcosystemStyles = /* css */ `
  html {
    touch-action: auto;
    height: 100%;
    background-color: #18181c;
    color-scheme: dark;
  }

  body {
    min-height: 100%;
    overflow: auto;
    overscroll-behavior: contain;
    -webkit-user-select: text;
    user-select: text;
    background-color: #18181c;
  }

  body * {
    -webkit-user-select: text;
    user-select: text;
  }

  [data-testid="sidebar-agent-list-scroll"],
  [data-testid="agent-chat-scroll"],
  [data-testid="git-diff-scroll"],
  [data-testid="file-explorer-tree-scroll"] {
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  [data-testid="sidebar-agent-list-scroll"]::-webkit-scrollbar,
  [data-testid="agent-chat-scroll"]::-webkit-scrollbar,
  [data-testid="git-diff-scroll"]::-webkit-scrollbar,
  [data-testid="file-explorer-tree-scroll"]::-webkit-scrollbar {
    width: 0;
    height: 0;
  }

  #root {
    min-height: 100%;
    background-color: #18181c;
  }
`;

function WebRespectfulStyleReset() {
  return (
    <style
      id="paseo-web-ecosystem"
      dangerouslySetInnerHTML={{ __html: webEcosystemStyles }}
    />
  );
}

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, user-scalable=yes, minimum-scale=1, maximum-scale=5"
        />
        {/* Reset scroll styles so React Native Web views behave like native. */}
        <ScrollViewStyleReset />
        <WebRespectfulStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
