import { goldenOutputFixtures } from './fixtures'
import { runCli } from '../helpers/run-cli'

describe('CLI golden output contract', () => {
  it.each(goldenOutputFixtures)('$name', async (fixture) => {
    const result = await runCli(fixture.args)

    expect(result.code).toBe(fixture.expectCode)
    if (fixture.expectJson) {
      expect(result.stdout).toContain('\n')
      expect(JSON.parse(result.stdout)).toMatchObject(fixture.expectJson)
    }
    for (const text of fixture.stdoutIncludes ?? []) {
      expect(result.stdout).toContain(text)
    }
    for (const text of fixture.stderrIncludes ?? []) {
      expect(result.stderr).toContain(text)
    }
  })
})
