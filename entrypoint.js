import { faker } from '@faker-js/faker';

console.log(faker.internet.userName())

const input = process.env.INPUT || 'ENV INPUT not defined'

console.log('input: ', input.slice(0, 5) + '...')

