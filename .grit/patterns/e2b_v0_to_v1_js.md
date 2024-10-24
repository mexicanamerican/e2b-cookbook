---
tags: [e2b, javascript, sdk, upgrade]
---

# Upgrade E2B JavaScript SDK from v0 to v1

This pattern upgrades the [E2B JavaScript SDK from v0 to v1](https://e2b.dev/docs/quickstart/migrating-from-v0).

```grit
engine marzano(0.1)
language js

or {
    `Sandbox.create({$params})` where {
        $params <: contains `template: $name` => ., // `timeoutMs: 300_000`,
        $params <: contains `cwd: $cwd` => .
    } => `Sandbox.create($name, {$params}) // TODO: cwd $cwd was removed, it can't be set on sbx anymore`,
    `Sandbox.create({$params})` where {
        $params <: contains `template: $name` => . // `timeoutMs: 300_000`
    } => `Sandbox.create($name, {$params})`,
    `Sandbox.create({$params})` where {
        $params <: contains `cwd: $cwd` => ., // `timeoutMs: 300_000`,
    } => `Sandbox.create({$params}) // TODO: cwd $cwd was removed, it can't be set on sbx anymore`,
    `$sbx.keepAlive($time)` => `$sbx.setTimeout($time)`,
    `Sandbox.reconnect($x)` => `Sandbox.connect($x)`,
    `$sbx.filesystem.write($path, $text)` => `$sbx.files.write($path, $text)`,
    `$sbx.uploadFile($file, $path)` => `$sbx.files.write($path, $file)`,
    `$sbx.downloadFile($path)` => `$sbx.files.read($path)`,
    `$sbx.process.startAndWait({$params})` where {
        $params <: contains `cmd: $cmd` => .,
    } => `$sbx.commands.run($cmd, {$params)`,
    `$sbx.process.startAndWait` => `$sbx.commands.run`,
    `$sbx.process.start({$params})` where {
        $params <: contains `cmd: $cmd` => .,
    } => `$sbx.commands.run($cmd, {$params})` where $params += `backgrund: true`,
    `const $watcher = $sbx.filesystem.watchDir($path)` => `` where {
        $program <: contains `$watcher.addEventListener($body)` => .,
        $program <: contains `await $watcher.start()` => `await $sbx.files.watchDir($path, $body)`
    },
    `let $watcher = $sbx.filesystem.watchDir($path)` => `` where {
        $program <: contains `$watcher.addEventListener($body)` => .,
        $program <: contains `await $watcher.start()` => `await $sbx.files.watchDir($path, $body)`
    },
    `var $watcher = $sbx.filesystem.watchDir($path)` => `` where {
        $program <: contains `$watcher.addEventListener($body)` => .,
        $program <: contains `await $watcher.start()` => `await $sbx.files.watchDir($path, $body)`
    },
    `$watcher = $sbx.filesystem.watchDir($path)` => `` where {
        $program <: contains `$watcher.addEventListener($body)` => .,
        $program <: contains `await $watcher.start()` => `await $sbx.files.watchDir($path, $body)`
    },
    `$sbx.id` => `$sbx.sandboxId`,
    `$sbx.fileURL` => `$sbx.uploadUrl()`,
    `$sbx.getHostname` => `$sbx.getHost()`,
    `$sbx.close()` => `$sbx.kill()`,
    $msg => `Sandbox` where { $msg <: "CodeInterpreter", $msg <: imported_from(`"@e2b/code-interpreter"`) },
    `$sbx.notebook.execCell($params)` => `$sbx.runCode($params)`,
    `ProcessMessage` => `OutputMessage`,
} where or {
    $program <: contains `import $_ from "@e2b/code-interpreter"`,
    $program <: contains `import $_ from "@e2b"`
}
```
