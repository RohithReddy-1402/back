const bcrypt=require('bcrypt')
const x=bcrypt.compare("$2b$10$6QT9mOP0bM67LVsnvHBzteujCFsLQEhQmUOmLWH1TEJNzXvp8L1Uq",1234)
console.log(x)
