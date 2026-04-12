default: test

ci: test

test:
    bun test --only-failures

publish: test
    npm version patch --no-git-tag-version
    npm publish

clean:
    rm -f ????-????.bin

npm-clean:
    npm cache clean --force
