import { faker } from '@faker-js/faker';

const input = process.env.INPUT

console.log('input: ', input.slice(0, 5) + '...')

console.log(faker.internet.userName())

