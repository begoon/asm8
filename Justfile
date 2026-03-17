default: test

ci: test

test:
    bun test --only-failures

clean:
    rm -f ????-????.bin
