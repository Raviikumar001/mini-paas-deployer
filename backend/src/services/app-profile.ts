import { access, readFile } from 'fs/promises'
import { join } from 'path'

export interface AppProfile {
  language: string | null
  framework: string | null
  startCommand: string | null
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export async function detectAppProfile(srcPath: string): Promise<AppProfile> {
  const packageJsonPath = join(srcPath, 'package.json')
  if (await fileExists(packageJsonPath)) {
    try {
      const raw = await readFile(packageJsonPath, 'utf8')
      const pkg = JSON.parse(raw) as {
        scripts?: Record<string, string>
        dependencies?: Record<string, string>
        devDependencies?: Record<string, string>
      }
      const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) }
      const framework =
        ('next' in deps && 'Next.js') ||
        ('@remix-run/react' in deps && 'Remix') ||
        ('@tanstack/react-router' in deps && 'React') ||
        ('react' in deps && 'React') ||
        ('vue' in deps && 'Vue') ||
        ('@angular/core' in deps && 'Angular') ||
        ('express' in deps && 'Express') ||
        ('hono' in deps && 'Hono') ||
        ('fastify' in deps && 'Fastify') ||
        ('koa' in deps && 'Koa') ||
        ('nestjs' in deps && 'NestJS') ||
        null

      return {
        language: 'TypeScript/JavaScript',
        framework,
        startCommand: pkg.scripts?.start ?? pkg.scripts?.dev ?? null,
      }
    } catch {
      return {
        language: 'TypeScript/JavaScript',
        framework: null,
        startCommand: null,
      }
    }
  }

  if (await fileExists(join(srcPath, 'go.mod'))) {
    return { language: 'Go', framework: null, startCommand: 'go run .' }
  }

  if (await fileExists(join(srcPath, 'Cargo.toml'))) {
    return { language: 'Rust', framework: null, startCommand: 'cargo run --release' }
  }

  if (await fileExists(join(srcPath, 'requirements.txt')) || await fileExists(join(srcPath, 'pyproject.toml'))) {
    return { language: 'Python', framework: inferPythonFramework(srcPath), startCommand: inferPythonStartCommand(srcPath) }
  }

  return { language: null, framework: null, startCommand: null }
}

function inferPythonFramework(srcPath: string): string | null {
  const fastApiHints = ['main.py', 'app.py']
  const flaskHints = ['app.py', 'wsgi.py']

  if (fastApiHints.some((file) => file.includes('py'))) {
    // lightweight heuristic; we do not parse Python code here
    return 'Python'
  }
  if (flaskHints.some((file) => file.includes('py'))) {
    return 'Python'
  }
  return 'Python'
}

function inferPythonStartCommand(srcPath: string): string {
  if (srcPath) {
    return 'python app.py'
  }
  return 'python'
}
