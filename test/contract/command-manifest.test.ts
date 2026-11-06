import { commandHelpFixtures, rootHelpFixture } from './fixtures'
import { runCli } from '../helpers/run-cli'

describe('CLI command manifest contract', () => {
  it('keeps the root command groups and global options visible', async () => {
    const result = await runCli(rootHelpFixture.args)

    expect(result.code).toBe(0)
    for (const text of rootHelpFixture.includes) {
      expect(result.stdout).toContain(text)
    }
  })

  it.each(commandHelpFixtures)('keeps $name help compatible', async (fixture) => {
    const result = await runCli(fixture.args)

    expect(result.code).toBe(0)
    for (const text of fixture.includes) {
      expect(result.stdout).toContain(text)
    }
  })
})
