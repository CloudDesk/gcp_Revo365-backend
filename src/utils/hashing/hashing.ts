//bcrypt is used to encrypt the given user password
import bcrypt from 'bcryptjs';

//saltRounds is defined for difficulty level of decoding the password
//if we give more value means it will take more time to generate the encrypted word (10 is enough)
const saltRounds = 10;

const hashGenerate = async (plainPassword) => {
    try {
        const salt = await bcrypt.genSalt(saltRounds)
        const hash = await bcrypt.hash(String(plainPassword), salt)
        return hash;
    }
    catch (error) {
        console.log(error)
        return error.message
    }
}
const hashValidator = async (plainPassword,hashedPassword) => {
    try {
        const result = await bcrypt.compare(String(plainPassword), hashedPassword)
        return result;
    }
    catch (error) {
        return false
    }
}

export { hashGenerate, hashValidator };

