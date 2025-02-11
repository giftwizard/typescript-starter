import { readFileSync, renameSync, writeFileSync } from 'fs';
import { join } from 'path';

import chalk from 'chalk';
import del from 'del';
import ora from 'ora';
import { replaceInFile } from 'replace-in-file';

import { Placeholders, Tasks } from './tasks';
import { normalizePath, Runner, TypescriptStarterOptions } from './utils';

const readPackageJson = (path: string) =>
  JSON.parse(readFileSync(path, 'utf8'));

const writePackageJson = (path: string, pkg: unknown) => {
  // write using the same format as npm:
  // https://github.com/npm/npm/blob/latest/lib/install/update-package-json.js#L48
  const stringified = JSON.stringify(pkg, null, 2) + '\n';
  return writeFileSync(path, stringified);
};

export async function typescriptStarter(
  {
    description,
    domDefinitions,
    email,
    fullName,
    githubUsername,
    install,
    nodeDefinitions,
    projectName,
    repoInfo,
    runner,
    vscode,
    workingDirectory,
  }: TypescriptStarterOptions,
  tasks: Tasks
): Promise<void> {
  console.log();
  const { commitHash, gitHistoryDir } = await tasks.cloneRepo(
    repoInfo,
    workingDirectory,
    projectName
  );
  await del([normalizePath(gitHistoryDir)]);
  console.log(`
  ${chalk.dim(`Cloned at commit: ${commitHash}`)}
`);

  const spinnerPackage = ora('Updating package.json').start();
  const projectPath = join(workingDirectory, projectName);
  const pkgPath = join(projectPath, 'package.json');

  const keptDevDeps: ReadonlyArray<string> = [
    '@ava/typescript',
    '@istanbuljs/nyc-config-typescript',
    '@typescript-eslint/eslint-plugin',
    '@typescript-eslint/parser',
    'ava',
    'eslint',
    'eslint-config-prettier',
    'eslint-plugin-eslint-comments',
    'eslint-plugin-import',
    'gh-pages',
    'npm-run-all',
    'nyc',
    'open-cli',
    'prettier',
    'standard-version',
    'trash-cli',
    'ts-node',
    'typedoc',
    'typescript',
  ];

  /**
   * dependencies to retain for Node.js applications
   */
  const nodeKeptDeps: ReadonlyArray<string> = [];

  const filterAllBut = (
    keep: ReadonlyArray<string>,
    from: { readonly [module: string]: number }
  ) =>
    keep.reduce<{ readonly [module: string]: number }>(
      (acc, moduleName: string) => {
        return { ...acc, [moduleName]: from[moduleName] };
      },
      {}
    );

  const pkg = readPackageJson(pkgPath);
  const scripts = {
    ...pkg.scripts,
    version: `standard-version -t ${projectName}\\@`,
    ...(runner === Runner.Yarn
      ? { 'reset-hard': `git clean -dfx && git reset --hard && yarn` }
      : {}),
  };
  const newPkg = {
    ...pkg,
    dependencies: nodeDefinitions
      ? filterAllBut(nodeKeptDeps, pkg.dependencies)
      : {},
    description,
    devDependencies: filterAllBut(keptDevDeps, pkg.devDependencies),
    keywords: [],
    name: projectName,
    repository: `https://github.com/${githubUsername}/${projectName}`,
    scripts,
    version: '1.0.0',
    ava: {
      ...pkg.ava,
      files: ['!build/module/**'],
      ignoredByWatcher: undefined,
    },
  };

  // eslint-disable-next-line functional/immutable-data
  delete newPkg.bin;
  // eslint-disable-next-line functional/immutable-data
  delete newPkg.NOTE;
  // eslint-disable-next-line functional/immutable-data
  delete newPkg.NOTE_2;

  writePackageJson(pkgPath, newPkg);
  spinnerPackage.succeed();

  const spinnerGitignore = ora('Updating .gitignore').start();
  await replaceInFile({
    files: join(projectPath, '.gitignore'),
    from: 'diff\n',
    to: '',
  });
  if (runner === Runner.Yarn) {
    await replaceInFile({
      files: join(projectPath, '.gitignore'),
      from: 'yarn.lock',
      to: 'package-lock.json',
    });
  }
  spinnerGitignore.succeed();

  const spinnerDelete = ora('Deleting unnecessary files').start();

  await del([
    normalizePath(join(projectPath, 'CHANGELOG.md')),
    normalizePath(join(projectPath, 'README.md')),
    normalizePath(join(projectPath, 'package-lock.json')),
    normalizePath(join(projectPath, 'bin')),
    normalizePath(join(projectPath, 'src', 'cli')),
  ]);

  if (!vscode) {
    del([normalizePath(join(projectPath, '.vscode'))]);
  }
  spinnerDelete.succeed();

  const spinnerTsconfigModule = ora('Removing traces of the CLI').start();

  spinnerTsconfigModule.succeed();

  const spinnerReadme = ora('Creating README.md').start();
  renameSync(
    join(projectPath, 'README-starter.md'),
    join(projectPath, 'README.md')
  );
  await replaceInFile({
    files: join(projectPath, 'README.md'),
    from: '[package-name]',
    to: projectName,
  });
  await replaceInFile({
    files: join(projectPath, 'README.md'),
    from: '[description]',
    to: description,
  });
  spinnerReadme.succeed();

  if (!domDefinitions) {
    const spinnerDom = ora(`tsconfig: don't include "dom" lib`).start();
    await replaceInFile({
      files: join(projectPath, 'tsconfig.json'),
      from: '"lib": ["es2017", "dom"]',
      to: '"lib": ["es2017"]',
    });
    await replaceInFile({
      files: join(projectPath, 'src', 'index.ts'),
      from: `export * from './lib/hash';\n`,
      to: '',
    });
    await del([
      normalizePath(join(projectPath, 'src', 'lib', 'hash.ts')),
      normalizePath(join(projectPath, 'src', 'lib', 'hash.spec.ts')),
    ]);
    spinnerDom.succeed();
  }

  if (!nodeDefinitions) {
    const spinnerNode = ora(`tsconfig: don't include "node" types`).start();
    await replaceInFile({
      files: join(projectPath, 'tsconfig.json'),
      from: '"types": ["node"]',
      to: '"types": []',
    });
    await replaceInFile({
      files: join(projectPath, 'src', 'index.ts'),
      from: `export * from './lib/async';\n`,
      to: '',
    });
    await replaceInFile({
      files: join(projectPath, 'src', 'index.ts'),
      from: `export * from './lib/hash';\n`,
      to: '',
    });
    await del([
      normalizePath(join(projectPath, 'src', 'lib', 'hash.ts')),
      normalizePath(join(projectPath, 'src', 'lib', 'hash.spec.ts')),
      normalizePath(join(projectPath, 'src', 'lib', 'async.ts')),
      normalizePath(join(projectPath, 'src', 'lib', 'async.spec.ts')),
    ]);
    spinnerNode.succeed();
  }

  if (install) {
    await tasks.install(runner, projectPath);
  }

  const gitIsConfigured =
    fullName !== Placeholders.name && email !== Placeholders.email
      ? true
      : false;
  if (gitIsConfigured) {
    const spinnerGitInit = ora(`Initializing git repository...`).start();
    await tasks.initialCommit(commitHash, projectPath, fullName);
    spinnerGitInit.succeed();
  }

  console.log(`\n${chalk.blue.bold(`Created ${projectName} 🎉`)}\n`);
}
