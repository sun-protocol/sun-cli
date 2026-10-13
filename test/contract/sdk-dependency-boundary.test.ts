import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(__dirname, '../..')

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dir, entry.name)
    return entry.isDirectory() ? sourceFiles(entryPath) : [entryPath]
  })
}

describe('public SUN SDK dependency boundary', () => {
  it('uses only public @sun-protocol SDK packages in production code', () => {
    const packageJson = fs.readFileSync(path.join(root, 'package.json'), 'utf8')
    const source = sourceFiles(path.join(root, 'src'))
      .map((file) => fs.readFileSync(file, 'utf8'))
      .join('\n')

    expect(packageJson).not.toContain('@sun-protocol/sun-kit')
    expect(packageJson).not.toContain('@sun-sdk/')
    expect(source).not.toContain('@sun-sdk/')
  })

  it('pins the public SDK packages to the tested release', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
    const dependencies = packageJson.dependencies as Record<string, string>
    const sdkPackages = [
      '@sun-protocol/sun-sdk-api',
      '@sun-protocol/sun-sdk-chains',
      '@sun-protocol/sun-sdk-core',
      '@sun-protocol/sun-sdk-protocols',
      '@sun-protocol/sun-sdk-runtime',
    ]

    for (const name of sdkPackages) {
      expect(dependencies[name]).toBe('0.1.1-beta.0')
    }
  })
})
