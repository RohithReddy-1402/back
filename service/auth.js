const jwt=require('jsonwebtoken');
function setUser(user){
    return jwt.sign({id:user._id,
        EmailID: user.EmailID,
        username: user.name}
        ,process.env.JWT_SECRET,{expiresIn:"30d"});
}
function getUser(token){
    if (!token)return null;
    try{
    return jwt.verify(token, process.env.JWT_SECRET);
    }
    catch (err) {
        return null;
    }
}
module.exports = { setUser, getUser };