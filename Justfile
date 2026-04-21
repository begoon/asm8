default: test

ci: test

test:
    bun test --only-failures

build-playground:
    printf 'export const BUILD_TIME = "%s";\n' "$(date '+%Y-%m-%d %H:%M:%S')" > docs/build-info.ts
    bun run build:docs

run-playground:
    bunx serve docs

publish: test
    npm version patch --no-git-tag-version
    npm publish

clean:
    rm -f *.sym *.map *.lst

npm-clean:
    npm cache clean --force
