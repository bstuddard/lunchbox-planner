import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Plugin } from 'vite'

const publicFiles = new Set([
  'art/lunchbox.png', 'icons/favicon.png', 'icons/icon-192.png',
  'icons/icon-512.png', 'icons/maskable-512.png',
])

export function developmentFiles(): Plugin {
  return {
    name: 'planner-development-files',
    apply: 'serve',
    config() {
      return {
        publicDir: false,
        server: {
          fs: {
            allow: ['index.html', 'src', 'node_modules', ...Array.from(publicFiles, file => 'public/' + file)],
            deny: [
              '.env', '.env.*', '*.{crt,pem,key,p12,pfx,cer,der}', '.npmrc', '.yarnrc.yml',
              '**/{.git,.private,.openai,.codex,.agents,.aws}/**', '**/*.[mM][dD]', '**/*.[jJ][sS][oO][nN]',
            ],
          },
        },
      }
    },
    configureServer(server) {
      // Let Vite serve these assets through its normal filesystem checks.
      // Keep the same public URLs used by the production build and manifest.
      const base = server.config.base
      server.middlewares.use((req, _res, next) => {
        const url = req.url ?? ''
        const pathname = url.split('?', 1)[0]
        if (pathname.startsWith(base) && publicFiles.has(pathname.slice(base.length)))
          req.url = base + 'public/' + url.slice(base.length)
        next()
      })
    },
  }
}

export function release(): Plugin {
  return {
    name: 'planner-release',
    apply: 'build',
    buildStart() {
      // Vite copies public/ verbatim, including files ignored by Git. Fail
      // closed so a misplaced local backup cannot enter a static deployment.
      function inspect(directory: string, prefix: string) {
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
          const name = prefix + entry.name
          if (entry.isDirectory()) inspect(join(directory, entry.name), name + '/')
          else if (!entry.isFile() || !publicFiles.has(name)) throw Error('Unapproved file in public/. Keep local files outside the website assets.')
        }
      }
      inspect('public', '')
    },
    transformIndexHtml() {
      return [{ tag: 'meta', injectTo: 'head-prepend', attrs: {
        'http-equiv': 'Content-Security-Policy',
        content: "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self'; connect-src 'self'; worker-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'",
      } }]
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'LICENSE.txt', source: readFileSync('LICENSE', 'utf8') })
      const packages = ['@fontsource-variable/dm-sans', '@fontsource-variable/bricolage-grotesque', 'workbox-core']
      const notices = packages.map(pkg => pkg + '\n\n' + readFileSync(join('node_modules', pkg, 'LICENSE'), 'utf8'))
      this.emitFile({ type: 'asset', fileName: 'asset-licenses.txt', source: notices.join('\n\n') })
    },
  }
}
